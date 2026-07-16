from django.urls import include, path

from messaging.urls import chat_message_patterns

from .views import ConversationListView, DirectChatCreateView

app_name = "chats"

urlpatterns = [
    path("", ConversationListView.as_view(), name="conversation-list"),
    path("direct/", DirectChatCreateView.as_view(), name="direct-chat"),
    path(
        "<int:chat_id>/messages/",
        include((chat_message_patterns, "messaging")),
    ),
]