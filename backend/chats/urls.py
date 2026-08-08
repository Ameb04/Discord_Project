from django.urls import include, path

from messaging.urls import chat_message_patterns

from .views import (
    ConversationListView,
    DirectChatCreateView,
    GroupDetailView,
    GroupJoinView,
    GroupListCreateView,
    GroupMemberCreateView,
    GroupMemberDeleteView,
)

app_name = "chats"

urlpatterns = [
    path("", ConversationListView.as_view(), name="conversation-list"),
    path("direct/", DirectChatCreateView.as_view(), name="direct-chat"),
    path(
        "<int:chat_id>/messages/",
        include((chat_message_patterns, "messaging")),
    ),
]

# Mounted at /api/groups/ by the root URLconf. Group ids are ints and invite
# tokens are not, so "join" cannot be shadowed by the detail route.
group_patterns = [
    path("", GroupListCreateView.as_view(), name="group-list"),
    path("join/<str:token>/", GroupJoinView.as_view(), name="group-join"),
    path("<int:group_id>/", GroupDetailView.as_view(), name="group-detail"),
    path(
        "<int:group_id>/members/",
        GroupMemberCreateView.as_view(),
        name="group-member-create",
    ),
    path(
        "<int:group_id>/members/<str:phone_number>/",
        GroupMemberDeleteView.as_view(),
        name="group-member-delete",
    ),
]
