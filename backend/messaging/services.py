from datetime import datetime, timezone as datetime_timezone
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.storage import FileSystemStorage, storages
from django.db import transaction
from django.utils import timezone
from django.utils.text import get_valid_filename

from chats.permissions import can_send_to_chat
from core.models import File

from .models import NormalMessage, ScheduledMessage, ScheduledMessageStatus
from .realtime import broadcast_message_after_commit


def get_private_storage():
    """Return the storage backend for private chat attachments.

    Uses the S3/MinIO ``private_media`` bucket when object storage is enabled,
    otherwise a local filesystem store rooted at ``PRIVATE_MEDIA_ROOT``. In
    local mode it is built per call so tests that override ``PRIVATE_MEDIA_ROOT``
    take effect immediately.
    """
    if getattr(settings, "USE_S3", False):
        return storages["private_media"]
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


def create_text_message(sender, chat, content):
    """Create an immediate text message in a chat the sender may write to."""
    _validate_sender(sender)
    if chat is None:
        raise ValidationError({"chat": "Chat is required."})
    if not can_send_to_chat(sender, chat):
        raise PermissionDenied("You do not have permission to send to this chat.")

    normalized_content = _validate_text_content(content)
    message = NormalMessage.objects.create(
        sender=sender,
        chat=chat,
        content=normalized_content,
    )
    broadcast_message_after_commit(message)
    return message


def create_scheduled_text_message(sender, chat, content, scheduled_at):
    """Store a text message for future delivery without sending it yet."""
    _validate_sender(sender)
    if chat is None:
        raise ValidationError({"chat": "Chat is required."})
    if not can_send_to_chat(sender, chat):
        raise PermissionDenied("You do not have permission to send to this chat.")

    normalized_content = _validate_text_content(content)
    normalized_scheduled_at = _validate_future_datetime(scheduled_at)
    return ScheduledMessage.objects.create(
        sender=sender,
        chat=chat,
        content=normalized_content,
        scheduled_at=normalized_scheduled_at,
    )


def deliver_scheduled_message(scheduled_message_id, *, current_time=None):
    """Deliver one due message exactly once, returning its locked record."""
    effective_time = current_time or timezone.now()
    with transaction.atomic():
        try:
            scheduled_message = (
                ScheduledMessage.objects.select_for_update()
                .select_related("chat")
                .get(pk=scheduled_message_id)
            )
        except ScheduledMessage.DoesNotExist:
            return None

        if scheduled_message.status != ScheduledMessageStatus.PENDING:
            return scheduled_message
        if scheduled_message.scheduled_at > effective_time:
            return scheduled_message

        try:
            delivered_message = create_text_message(
                scheduled_message.sender,
                scheduled_message.chat,
                scheduled_message.content,
            )
        except (PermissionDenied, ValidationError) as exc:
            scheduled_message.status = ScheduledMessageStatus.FAILED
            scheduled_message.processed_at = effective_time
            scheduled_message.failure_reason = _delivery_failure_reason(exc)
            scheduled_message.save(
                update_fields=("status", "processed_at", "failure_reason")
            )
            return scheduled_message

        scheduled_message.status = ScheduledMessageStatus.SENT
        scheduled_message.processed_at = effective_time
        scheduled_message.failure_reason = ""
        scheduled_message.delivered_message = delivered_message
        scheduled_message.save(
            update_fields=(
                "status",
                "processed_at",
                "failure_reason",
                "delivered_message",
            )
        )
        return scheduled_message


def cancel_scheduled_message(sender, scheduled_message_id):
    """Cancel one owned pending message while excluding the delivery worker."""
    _validate_sender(sender)
    with transaction.atomic():
        try:
            scheduled_message = ScheduledMessage.objects.select_for_update().get(
                pk=scheduled_message_id,
                sender=sender,
            )
        except ScheduledMessage.DoesNotExist:
            return None

        if scheduled_message.status != ScheduledMessageStatus.PENDING:
            raise ValidationError(
                {"status": "Only pending scheduled messages can be cancelled."}
            )

        scheduled_message.status = ScheduledMessageStatus.CANCELLED
        scheduled_message.processed_at = timezone.now()
        scheduled_message.failure_reason = ""
        scheduled_message.save(
            update_fields=("status", "processed_at", "failure_reason")
        )
        return scheduled_message


def create_media_message(sender, chat, uploaded_file, content=""):
    """Create an immediate message with one privately stored attachment."""
    _validate_sender(sender)
    if chat is None:
        raise ValidationError({"chat": "Chat is required."})
    if not can_send_to_chat(sender, chat):
        raise PermissionDenied("You do not have permission to send to this chat.")

    _validate_uploaded_file(uploaded_file)
    normalized_content = _validate_optional_content(content)
    safe_name = _safe_file_name(uploaded_file.name)
    file_size = uploaded_file.size
    file_type = getattr(uploaded_file, "content_type", "") or ""
    storage_path = _build_private_storage_path(chat, safe_name)

    storage = get_private_storage()
    saved_path = storage.save(storage_path, uploaded_file)
    try:
        with transaction.atomic():
            stored_file = File.objects.create(
                name=safe_name,
                type=file_type,
                storage_path=saved_path,
                size=file_size,
            )
            message = NormalMessage.objects.create(
                sender=sender,
                chat=chat,
                content=normalized_content,
                file=stored_file,
            )
            broadcast_message_after_commit(message)
            return message
    except Exception:
        storage.delete(saved_path)
        raise


def edit_message(sender, chat, message_id, content=None, uploaded_file=None, remove_file=False):
    """Edit an existing message, modifying its content and/or file attachment."""
    _validate_sender(sender)

    try:
        message = NormalMessage.objects.get(pk=message_id, chat=chat, is_deleted=False)
    except NormalMessage.DoesNotExist:
        raise ValidationError({"message": "Message not found."})

    if message.sender_id != sender.pk:
        raise PermissionDenied("You can only edit your own messages.")

    # Determine final states
    new_content = message.content if content is None else _validate_optional_content(content)

    will_have_file = (
        (message.file_id is not None and not remove_file) or
        (uploaded_file is not None)
    )

    if not new_content and not will_have_file:
        raise ValidationError({"content": "Message must have content or an attachment."})

    has_changes = False

    if content is not None and message.content != new_content:
        message.content = new_content
        has_changes = True

    storage = get_private_storage()
    old_file_to_delete = None
    old_storage_path = None
    new_saved_path = None

    if remove_file or uploaded_file is not None:
        if message.file:
            old_file_to_delete = message.file
            old_storage_path = message.file.storage_path
            message.file = None
            has_changes = True

    if uploaded_file is not None:
        _validate_uploaded_file(uploaded_file)
        safe_name = _safe_file_name(uploaded_file.name)
        file_size = uploaded_file.size
        file_type = getattr(uploaded_file, "content_type", "") or ""
        storage_path = _build_private_storage_path(chat, safe_name)

        new_saved_path = storage.save(storage_path, uploaded_file)
        try:
            with transaction.atomic():
                stored_file = File.objects.create(
                    name=safe_name,
                    type=file_type,
                    storage_path=new_saved_path,
                    size=file_size,
                )
                message.file = stored_file
                if has_changes:
                    message.is_edited = True
                message.save(update_fields=['content', 'file', 'is_edited'])

                # Delete old file only if everything succeeds
                if old_file_to_delete:
                    if old_storage_path:
                        storage.delete(old_storage_path)
                    old_file_to_delete.delete()

                broadcast_message_after_commit(message)

            return message
        except Exception:
            if new_saved_path:
                storage.delete(new_saved_path)
            raise
    elif has_changes:
        message.is_edited = True
        message.save(update_fields=['content', 'file', 'is_edited'])

        if old_file_to_delete:
            if old_storage_path:
                storage.delete(old_storage_path)
            old_file_to_delete.delete()

        broadcast_message_after_commit(message)

    return message


def _validate_sender(sender):
    if not (
        sender
        and getattr(sender, "is_authenticated", False)
        and getattr(sender, "is_active", False)
    ):
        raise PermissionDenied("A valid active sender is required.")


def _validate_text_content(content):
    if not isinstance(content, str):
        raise ValidationError({"content": "Message content is required."})

    normalized_content = content.strip()
    if not normalized_content:
        raise ValidationError({"content": "Message content cannot be empty."})

    return normalized_content


def _validate_optional_content(content):
    if not isinstance(content, str):
        raise ValidationError({"content": "Message content must be text."})
    return content.strip()


def _validate_future_datetime(value):
    if not isinstance(value, datetime) or not timezone.is_aware(value):
        raise ValidationError(
            {"scheduled_at": "Delivery time must include a timezone."}
        )
    if value <= timezone.now():
        raise ValidationError(
            {"scheduled_at": "Delivery time must be in the future."}
        )
    return value.astimezone(datetime_timezone.utc)


def _delivery_failure_reason(error):
    if hasattr(error, "message_dict"):
        messages = [
            message
            for values in error.message_dict.values()
            for message in values
        ]
        return " ".join(messages)
    if hasattr(error, "messages"):
        return " ".join(error.messages)
    return str(error)


def _validate_uploaded_file(uploaded_file):
    if uploaded_file is None:
        raise ValidationError({"file": "File is required."})
    if not getattr(uploaded_file, "name", ""):
        raise ValidationError({"file": "File name is required."})
    if getattr(uploaded_file, "size", 0) <= 0:
        raise ValidationError({"file": "File cannot be empty."})


def _safe_file_name(file_name):
    basename = str(file_name).replace("\\", "/").rsplit("/", 1)[-1]
    safe_name = get_valid_filename(basename)
    if not safe_name:
        raise ValidationError({"file": "File name is invalid."})
    return safe_name


def _build_private_storage_path(chat, safe_name):
    return f"attachments/chat_{chat.pk}/{uuid4().hex}_{safe_name}"
