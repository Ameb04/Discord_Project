from django.urls import path

from .consumers import ChatMessageConsumer, UserNotificationConsumer


websocket_urlpatterns = [
    path("ws/chats/<int:chat_id>/", ChatMessageConsumer.as_asgi()),
    path("ws/notifications/", UserNotificationConsumer.as_asgi()),
]
