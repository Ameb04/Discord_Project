"""SPA session auth — separate from Django admin login."""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User

APP_USER_SESSION_KEY = "app_user_id"


def app_login(request, user):
    """Open an SPA session without touching the admin session key."""
    request.session[APP_USER_SESSION_KEY] = user.pk
    request.session.modified = True


def app_logout(request):
    """Close only the SPA session; admin login stays intact."""
    request.session.pop(APP_USER_SESSION_KEY, None)
    request.session.modified = True


class AppSessionAuthentication(BaseAuthentication):
    """Authenticate API requests using the SPA session key only."""

    def authenticate(self, request):
        user_id = request.session.get(APP_USER_SESSION_KEY)
        if not user_id:
            return None

        try:
            user = User.objects.get(pk=user_id, is_active=True)
        except User.DoesNotExist as exc:
            raise AuthenticationFailed("Invalid session.") from exc

        return (user, None)
