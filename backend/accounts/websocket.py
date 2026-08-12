from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from channels.sessions import SessionMiddlewareStack
from django.contrib.auth.models import AnonymousUser

from .authentication import APP_USER_SESSION_KEY
from .models import User


@database_sync_to_async
def _get_app_user(user_id):
    if not user_id:
        return AnonymousUser()

    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class AppSessionAuthMiddleware(BaseMiddleware):
    """Populate a WebSocket scope from the SPA's custom session key."""

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        session = scope.get("session")
        user_id = (
            await session.aget(APP_USER_SESSION_KEY)
            if session is not None
            else None
        )
        scope["user"] = await _get_app_user(user_id)
        return await super().__call__(scope, receive, send)


def AppSessionAuthMiddlewareStack(inner):
    """Load the Django session before resolving the application user."""
    return SessionMiddlewareStack(AppSessionAuthMiddleware(inner))
