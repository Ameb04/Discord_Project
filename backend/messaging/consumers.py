import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from accounts.models import User
from chats.models import Chat
from chats.permissions import can_access_chat

from .realtime import chat_group_name


@database_sync_to_async
def _user_can_access_chat(user_id, chat_id):
    try:
        user = User.objects.get(pk=user_id, is_active=True)
        chat = Chat.objects.get(pk=chat_id)
    except (User.DoesNotExist, Chat.DoesNotExist):
        return False
    return can_access_chat(user, chat)


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
        if not await _user_can_access_chat(self.user_id, self.chat_id):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )
            self.group_name = None
            await self.close(code=4403)
            return

        await self.send(
            text_data=json.dumps(
                {
                    "type": "message.created",
                    "message": event["message"],
                }
            )
        )
