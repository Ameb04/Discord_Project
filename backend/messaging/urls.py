from django.urls import path

from .views import AttachmentDownloadView, MediaMessageCreateView, MessageListCreateView

app_name = "messaging"

chat_message_patterns = [
    path("media/", MediaMessageCreateView.as_view(), name="media-message"),
    path("", MessageListCreateView.as_view(), name="message-list"),
]

urlpatterns = [
    path(
        "<int:message_id>/attachment/",
        AttachmentDownloadView.as_view(),
        name="attachment-download",
    ),
]
