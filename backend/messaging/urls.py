from django.urls import path

from .views import MediaMessageCreateView, MessageListCreateView

app_name = "messaging"

urlpatterns = [
    path("media/", MediaMessageCreateView.as_view(), name="media-message"),
    path("", MessageListCreateView.as_view(), name="message-list"),
]
