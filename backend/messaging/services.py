from django.core.exceptions import PermissionDenied, ValidationError

from chats.permissions import can_send_to_chat

from .models import NormalMessage


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
