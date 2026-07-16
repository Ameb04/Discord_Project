from django.urls import path

from .views import MessageListCreateView

app_name = "messaging"

urlpatterns = [
    path("", MessageListCreateView.as_view(), name="message-list"),
]
