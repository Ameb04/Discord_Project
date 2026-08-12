from django.urls import include, path

from messaging.urls import chat_message_patterns

from .views import (
    ChannelDetailView,
    ChannelDirectoryView,
    ChannelInviteJoinView,
    ChannelInviteResetView,
    ChannelJoinView,
    ChannelListCreateView,
    ChannelMemberCreateView,
    ChannelMemberDetailView,
    ConversationListView,
    DirectChatCreateView,
    GroupDetailView,
    GroupInviteResetView,
    GroupJoinView,
    GroupListCreateView,
    GroupMemberCreateView,
    GroupMemberDeleteView,
    TopicDetailView,
    TopicListCreateView,
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
        "<int:group_id>/invite/reset/",
        GroupInviteResetView.as_view(),
        name="group-invite-reset",
    ),
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

# Mounted at /api/channels/. Same shape as groups, plus topics underneath and
# a directory for the public ones.
channel_patterns = [
    path("", ChannelListCreateView.as_view(), name="channel-list"),
    path("discover/", ChannelDirectoryView.as_view(), name="channel-directory"),
    path(
        "join/<str:token>/",
        ChannelInviteJoinView.as_view(),
        name="channel-invite-join",
    ),
    path("<int:channel_id>/", ChannelDetailView.as_view(), name="channel-detail"),
    path(
        "<int:channel_id>/join/",
        ChannelJoinView.as_view(),
        name="channel-join",
    ),
    path(
        "<int:channel_id>/invite/reset/",
        ChannelInviteResetView.as_view(),
        name="channel-invite-reset",
    ),
    path(
        "<int:channel_id>/members/",
        ChannelMemberCreateView.as_view(),
        name="channel-member-create",
    ),
    path(
        "<int:channel_id>/members/<str:phone_number>/",
        ChannelMemberDetailView.as_view(),
        name="channel-member-detail",
    ),
    path(
        "<int:channel_id>/topics/",
        TopicListCreateView.as_view(),
        name="topic-list",
    ),
    path(
        "<int:channel_id>/topics/<int:topic_id>/",
        TopicDetailView.as_view(),
        name="topic-detail",
    ),
]
