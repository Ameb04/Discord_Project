from datetime import datetime, timezone as datetime_timezone
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.storage import FileSystemStorage, storages
from django.db import transaction
from django.utils import timezone
from django.utils.text import get_valid_filename

from chats.permissions import (
    can_access_chat,
    can_delete_message,
    can_send_media_to_chat,
    can_send_to_chat,
    chat_member_ids,
)
from core.models import File

from .models import (
    ChatReadState,
    NormalMessage,
    ScheduledMessage,
    ScheduledMessageStatus,
)
from .realtime import (
    broadcast_message_after_commit,
    broadcast_message_deleted_after_commit,
    broadcast_read_state_after_commit,
)
from .scheduling import enqueue_delivery_on_commit


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
    scheduled_message = ScheduledMessage.objects.create(
        sender=sender,
        chat=chat,
        content=normalized_content,
        scheduled_at=normalized_scheduled_at,
    )
    # Hand it straight to a worker with an exact ETA. The periodic sweep is
    # only a fallback for what this misses; see messaging.scheduling.
    enqueue_delivery_on_commit(scheduled_message)
    return scheduled_message


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
    if not can_send_media_to_chat(sender, chat):
        raise PermissionDenied("Media is not enabled in this chat.")

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
    """Edit an existing message, modifying its content and/or file attachment.

    ``content=None`` leaves the text untouched. Uploading a file always replaces
    the current attachment; ``remove_file`` drops it without a replacement. A
    call that would not change anything is a no-op and leaves ``is_edited`` alone.
    """
    _validate_sender(sender)

    try:
        message = NormalMessage.objects.get(pk=message_id, chat=chat, is_deleted=False)
    except NormalMessage.DoesNotExist:
        raise ValidationError({"message": "Message not found."})

    if message.sender_id != sender.pk:
        raise PermissionDenied("You can only edit your own messages.")

    new_content = message.content if content is None else _validate_optional_content(content)

    # Resolve the target attachment state before touching anything.
    attaches_file = uploaded_file is not None
    detaches_file = message.file_id is not None and (remove_file or attaches_file)
    will_have_file = attaches_file or (message.file_id is not None and not remove_file)

    # Only a *new* attachment is gated. Keeping one that predates the switch
    # being turned off is not an upload, and removing it is always allowed.
    if attaches_file and not can_send_media_to_chat(sender, chat):
        raise PermissionDenied("Media is not enabled in this chat.")

    if not new_content and not will_have_file:
        raise ValidationError({"content": "Message must have content or an attachment."})

    if new_content == message.content and not (attaches_file or detaches_file):
        return message

    old_file = message.file if detaches_file else None
    message.content = new_content

    storage = get_private_storage()
    new_saved_path = None

    if attaches_file:
        _validate_uploaded_file(uploaded_file)
        safe_name = _safe_file_name(uploaded_file.name)
        file_size = uploaded_file.size
        file_type = getattr(uploaded_file, "content_type", "") or ""
        new_saved_path = storage.save(
            _build_private_storage_path(chat, safe_name), uploaded_file
        )

    try:
        with transaction.atomic():
            if attaches_file:
                message.file = File.objects.create(
                    name=safe_name,
                    type=file_type,
                    storage_path=new_saved_path,
                    size=file_size,
                )
            elif detaches_file:
                message.file = None

            message.is_edited = True
            message.save(update_fields=["content", "file", "is_edited"])

            # Drop the replaced attachment only once the new state is in place.
            if old_file is not None:
                if old_file.storage_path:
                    storage.delete(old_file.storage_path)
                old_file.delete()

            broadcast_message_after_commit(message)
    except Exception:
        if new_saved_path:
            storage.delete(new_saved_path)
        raise

    return message


def delete_message(actor, chat, message_id):
    """Soft-delete a message and tell the chat's listeners it is gone.

    The author may delete their own message anywhere; a group owner may also
    delete anyone's message in their group. Deletion is a moderation power,
    so it deliberately does *not* come with the right to edit.

    Any attachment is dropped from storage with the message — a soft-deleted
    row is unreachable through every read path, so keeping the bytes would
    only leave an orphan nobody can reach.
    """
    _validate_sender(actor)

    try:
        message = NormalMessage.objects.select_related("chat", "file").get(
            pk=message_id, chat=chat, is_deleted=False
        )
    except NormalMessage.DoesNotExist:
        raise ValidationError({"message": "Message not found."})

    if not can_delete_message(actor, message):
        raise PermissionDenied("You do not have permission to delete this message.")

    attached_file = message.file
    storage_path = attached_file.storage_path if attached_file else ""

    with transaction.atomic():
        message.is_deleted = True
        message.file = None
        message.save(update_fields=["is_deleted", "file"])

        if attached_file is not None:
            attached_file.delete()

        broadcast_message_deleted_after_commit(message)

    # Outside the transaction: a rolled-back delete must not have already
    # destroyed the bytes it was meant to keep.
    if storage_path:
        get_private_storage().delete(storage_path)

    return message


def mark_chat_read(reader, chat, message_id=None):
    """Advance ``reader``'s read watermark in ``chat``.

    Passing no ``message_id`` marks everything currently visible as read. The
    watermark only ever moves forward, so an out-of-order request — a stale tab
    reporting an old message — cannot un-read anything.

    Returns the resulting watermark.
    """
    _validate_sender(reader)
    if chat is None:
        raise ValidationError({"chat": "Chat is required."})
    if not can_access_chat(reader, chat):
        raise PermissionDenied("You do not have permission to access this chat.")

    if message_id is None:
        target_id = (
            NormalMessage.objects.filter(chat=chat, is_deleted=False)
            .order_by("-pk")
            .values_list("pk", flat=True)
            .first()
        ) or 0
    else:
        if not NormalMessage.objects.filter(
            pk=message_id, chat=chat, is_deleted=False
        ).exists():
            raise ValidationError({"message_id": "Message not found in this chat."})
        target_id = message_id

    with transaction.atomic():
        read_state, _ = ChatReadState.objects.select_for_update().get_or_create(
            chat=chat, user=reader, defaults={"last_read_message_id": target_id}
        )

        if read_state.last_read_message_id >= target_id:
            return read_state.last_read_message_id

        read_state.last_read_message_id = target_id
        read_state.save(update_fields=("last_read_message_id", "updated_at"))
        broadcast_read_state_after_commit(chat.pk, reader.pk, target_id)

    return target_id


def get_chat_read_state(viewer, chat):
    """Return how far everyone *else* in ``chat`` has read.

    The viewer's own watermark is left out: receipts answer "who has seen what
    I sent", and a sender reading their own message says nothing.
    """
    _validate_sender(viewer)
    if not can_access_chat(viewer, chat):
        raise PermissionDenied("You do not have permission to access this chat.")

    other_ids = [pk for pk in chat_member_ids(chat) if pk != viewer.pk]
    stored = dict(
        ChatReadState.objects.filter(chat=chat, user_id__in=other_ids).values_list(
            "user_id", "last_read_message_id"
        )
    )

    return {
        "other_member_count": len(other_ids),
        # Members who have never opened the chat count as having read nothing,
        # so the client can tell "not seen yet" from "not a member".
        "watermarks": {str(pk): stored.get(pk, 0) for pk in other_ids},
    }


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
