from django.urls import include, path

from .views import DirectChatCreateView

app_name = "chats"

urlpatterns = [
    path("direct/", DirectChatCreateView.as_view(), name="direct-chat"),
    path("<int:chat_id>/messages/", include("messaging.urls")),
]
