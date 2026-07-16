from django.urls import include, path

from messaging.urls import chat_message_patterns

from .views import DirectChatCreateView

app_name = "chats"

urlpatterns = [
    path("direct/", DirectChatCreateView.as_view(), name="direct-chat"),
    path(
        "<int:chat_id>/messages/",
        include((chat_message_patterns, "messaging")),
    ),
]
