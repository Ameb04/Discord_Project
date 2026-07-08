from django.contrib.auth import login, logout
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import (
    LoginSerializer,
    PublicUserSerializer,
    RegisterSerializer,
    UserSerializer,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFView(APIView):
    """Sets the csrftoken cookie so the SPA can send it back on writes."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/ - create a new account."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class LoginView(APIView):
    """POST /api/auth/login/ - authenticate and open a session."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    """POST /api/auth/logout/ - close the current session."""

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."})


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/users/me/ - view and edit own profile (4.10)."""

    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class UserDetailView(generics.RetrieveAPIView):
    """GET /api/users/<phone_number>/ - view another user's public profile."""

    queryset = User.objects.all()
    serializer_class = PublicUserSerializer
    lookup_field = "phone_number"


class UserSearchView(generics.ListAPIView):
    """GET /api/users/search/?q=... - find users by phone or name."""

    serializer_class = PublicUserSerializer

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return User.objects.none()
        return User.objects.filter(
            Q(phone_number__icontains=query)
            | Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
        ).exclude(pk=self.request.user.pk)
