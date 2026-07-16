from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from chats.models import Chat
from chats.permissions import can_access_chat

from .models import NormalMessage
from .serializers import (
    MediaMessageCreateSerializer,
    NormalMessageSerializer,
    TextMessageCreateSerializer,
)
from .services import create_media_message, create_text_message


class MessageListCreateView(APIView):
    """GET/POST /api/chats/<chat_id>/messages/."""

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        messages = (
            NormalMessage.objects.filter(chat=chat, is_deleted=False)
            .select_related("sender", "sender__tag")
            .order_by("sent_at", "pk")
        )
        serializer = NormalMessageSerializer(
            messages, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        request_serializer = TextMessageCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            message = create_text_message(
                request.user,
                chat,
                request_serializer.validated_data["content"],
            )
        except DjangoValidationError as exc:
            raise ValidationError(_validation_error_detail(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        response_serializer = NormalMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class MediaMessageCreateView(APIView):
    """POST /api/chats/<chat_id>/messages/media/."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        request_serializer = MediaMessageCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            message = create_media_message(
                request.user,
                chat,
                request_serializer.validated_data["file"],
                request_serializer.validated_data.get("content", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(_validation_error_detail(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        response_serializer = NormalMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


def _validation_error_detail(error):
    if hasattr(error, "message_dict"):
        return error.message_dict
    if hasattr(error, "messages"):
        return error.messages
    return str(error)
