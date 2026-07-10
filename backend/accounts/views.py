from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import app_login, app_logout
from .models import User
from .serializers import (
    ChangePasswordSerializer,
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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        app_login(request, user)
        return Response(
            UserSerializer(user, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """POST /api/auth/login/ - authenticate and open an SPA session."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        app_login(request, user)
        return Response(UserSerializer(user, context={"request": request}).data)


class LogoutView(APIView):
    """POST /api/auth/logout/ - close the current SPA session."""

    def post(self, request):
        app_logout(request)
        return Response({"detail": "Logged out."})


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ - update the current user's password."""

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated."})


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/ - view and edit own profile (4.10)."""

    serializer_class = UserSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.user

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class UserDetailView(generics.RetrieveAPIView):
    """GET /api/users/<phone_number>/ - view another user's public profile."""

    queryset = User.objects.select_related("tag")
    serializer_class = PublicUserSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    lookup_field = "phone_number"


class UserSearchView(generics.ListAPIView):
    """GET /api/users/search/?q=... - find users by phone or name."""

    serializer_class = PublicUserSerializer

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return User.objects.none()
        return (
            User.objects.select_related("tag")
            .filter(
                Q(phone_number__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
            .exclude(pk=self.request.user.pk)
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context
