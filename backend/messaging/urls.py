from django.urls import path

from .views import AttachmentDownloadView, MediaMessageCreateView, MessageListCreateView, MessageUpdateView

app_name = "messaging"

chat_message_patterns = [
    path("media/", MediaMessageCreateView.as_view(), name="media-message"),
    path("<int:message_id>/", MessageUpdateView.as_view(), name="message-update"),
    path("", MessageListCreateView.as_view(), name="message-list"),
]

urlpatterns = [
    path(
        "<int:message_id>/attachment/",
        AttachmentDownloadView.as_view(),
        name="attachment-download",
    ),
]
