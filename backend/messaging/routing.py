from django.urls import path

from .consumers import ChatMessageConsumer


websocket_urlpatterns = [
    path("ws/chats/<int:chat_id>/", ChatMessageConsumer.as_asgi()),
]
