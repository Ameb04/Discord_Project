from django.urls import path

from .views import (
    CSRFView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    UserDetailView,
    UserSearchView,
)

auth_patterns = [
    path("csrf/", CSRFView.as_view(), name="csrf"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="auth-me"),
]

# NOTE: static routes (me, search) must precede the <phone_number> catch-all.
user_patterns = [
    path("me/", MeView.as_view(), name="me"),
    path("search/", UserSearchView.as_view(), name="user-search"),
    path("<str:phone_number>/", UserDetailView.as_view(), name="user-detail"),
]
