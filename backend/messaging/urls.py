from django.urls import path

from .views import (
    AttachmentDownloadView,
    MediaMessageCreateView,
    MessageContextView,
    MessageHistoryView,
    MessageListCreateView,
    MessageSearchView,
    MessageUpdateView,
    ScheduledMessageCreateView,
    ScheduledMessageCancelView,
    ScheduledMessageListView,
)

app_name = "messaging"

chat_message_patterns = [
    path("history/", MessageHistoryView.as_view(), name="message-history"),
    path("search/", MessageSearchView.as_view(), name="message-search"),
    path(
        "<int:message_id>/context/",
        MessageContextView.as_view(),
        name="message-context",
    ),
    path("media/", MediaMessageCreateView.as_view(), name="media-message"),
    path(
        "scheduled/",
        ScheduledMessageCreateView.as_view(),
        name="scheduled-message",
    ),
    path("<int:message_id>/", MessageUpdateView.as_view(), name="message-update"),
    path("", MessageListCreateView.as_view(), name="message-list"),
]

urlpatterns = [
    path(
        "scheduled/<int:message_id>/",
        ScheduledMessageCancelView.as_view(),
        name="scheduled-message-cancel",
    ),
    path(
        "scheduled/",
        ScheduledMessageListView.as_view(),
        name="scheduled-message-list",
    ),
    path(
        "<int:message_id>/attachment/",
        AttachmentDownloadView.as_view(),
        name="attachment-download",
    ),
]
