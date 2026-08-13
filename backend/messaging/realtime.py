from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from .models import NormalMessage
from .serializers import NormalMessageSerializer


def chat_group_name(chat_id):
    return f"chat_{chat_id}"


def broadcast_message_after_commit(message):
    """Broadcast a canonical normal-message payload only after commit.

    The id is captured now and the row re-read at broadcast time, so listeners
    always receive the committed state rather than whatever the in-memory
    instance happened to hold.
    """
    message_id = message.pk
    transaction.on_commit(lambda: _broadcast_message(message_id), robust=True)


def _broadcast_message(message_id):
    try:
        message = NormalMessage.objects.select_related(
            "sender", "sender__tag", "file"
        ).get(pk=message_id, is_deleted=False)
    except NormalMessage.DoesNotExist:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        chat_group_name(message.chat_id),
        {
            "type": "chat.message",
            "message": NormalMessageSerializer(message).data,
        },
    )
