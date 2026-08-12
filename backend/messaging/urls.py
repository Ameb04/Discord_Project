from django.urls import path

from .views import (
    AttachmentDownloadView,
    MediaMessageCreateView,
    MessageContextView,
    MessageHistoryView,
    MessageListCreateView,
    MessageSearchView,
    ScheduledMessageCreateView,
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
    path("", MessageListCreateView.as_view(), name="message-list"),
]

urlpatterns = [
    path(
        "<int:message_id>/attachment/",
        AttachmentDownloadView.as_view(),
        name="attachment-download",
    ),
]
