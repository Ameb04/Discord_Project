from uuid import uuid4

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.storage import FileSystemStorage, storages
from django.db import transaction
from django.utils.text import get_valid_filename

from chats.permissions import can_send_to_chat
from core.models import File

from .models import NormalMessage


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
    return NormalMessage.objects.create(
        sender=sender,
        chat=chat,
        content=normalized_content,
    )


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
            return NormalMessage.objects.create(
                sender=sender,
                chat=chat,
                content=normalized_content,
                file=stored_file,
            )
    except Exception:
        storage.delete(saved_path)
        raise


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
