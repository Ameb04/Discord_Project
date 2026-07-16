from django.urls import path

from .views import DirectChatCreateView

app_name = "chats"

urlpatterns = [
    path("direct/", DirectChatCreateView.as_view(), name="direct-chat"),
]
