import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from accounts.models import User
from chats.models import Chat
from chats.permissions import can_access_chat

from .notifications import user_notification_group_name
from .realtime import chat_group_name


@database_sync_to_async
def _user_can_access_chat(user_id, chat_id):
    try:
        user = User.objects.get(pk=user_id, is_active=True)
        chat = Chat.objects.get(pk=chat_id)
    except (User.DoesNotExist, Chat.DoesNotExist):
        return False
    return can_access_chat(user, chat)


@database_sync_to_async
def _user_is_still_active(user_id):
    return User.objects.filter(pk=user_id, is_active=True).exists()


class ChatMessageConsumer(AsyncWebsocketConsumer):
    """Receive server-generated message events for one authorized chat."""

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated or not user.is_active:
            await self.close(code=4401)
            return

        self.chat_id = self.scope["url_route"]["kwargs"]["chat_id"]
        self.user_id = user.pk
        if not await _user_can_access_chat(self.user_id, self.chat_id):
            await self.close(code=4403)
            return

        self.group_name = chat_group_name(self.chat_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Message creation remains REST-based; client socket payloads are ignored.
        return

    async def chat_message(self, event):
        await self._forward_if_still_allowed(
            {
                "type": "message.created",
                "message": event["message"],
            }
        )

    async def chat_message_deleted(self, event):
        await self._forward_if_still_allowed(
            {
                "type": "message.deleted",
                "message_id": event["message_id"],
                "chat": event["chat_id"],
            }
        )

    async def chat_read(self, event):
        # Echoed to the reader too; their own client simply ignores it, and
        # filtering here would cost a comparison on every fan-out.
        await self._forward_if_still_allowed(
            {
                "type": "chat.read",
                "chat": event["chat_id"],
                "reader": event["reader_id"],
                "last_read_message_id": event["last_read_message_id"],
            }
        )

    async def _forward_if_still_allowed(self, payload):
        """Send one event, re-checking access so a removed member goes quiet.

        Membership can change while the socket is open, so authorization is
        rechecked per event rather than only at connect time.
        """
        if not await _user_can_access_chat(self.user_id, self.chat_id):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
            self.group_name = None
            await self.close(code=4403)
            return

        await self.send(text_data=json.dumps(payload))


class UserNotificationConsumer(AsyncWebsocketConsumer):
    """Carry one person's notifications, for every conversation at once.

    Deliberately not per chat: the point of a notification is to reach someone
    who does *not* have that conversation open, so it cannot ride the socket
    they only hold while they do. One socket per signed-in tab covers every
    room they belong to, including ones they join after connecting.

    Muting is applied at fan-out rather than here, so a mute takes effect
    without the reader's socket knowing anything about it.
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated or not user.is_active:
            await self.close(code=4401)
            return

        self.user_id = user.pk
        self.group_name = user_notification_group_name(self.user_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Notifications are server-generated; client payloads are ignored.
        return

    async def notify_message(self, event):
        # A deactivated account keeps its socket until it next hears something,
        # so the check is here rather than only at connect time. Membership is
        # already settled by the fan-out, which recomputes it per message.
        if not await _user_is_still_active(self.user_id):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
            self.group_name = None
            await self.close(code=4401)
            return

        await self.send(
            text_data=json.dumps(
                {
                    "type": "notification.message",
                    **event["notification"],
                }
            )
        )
