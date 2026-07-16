from pathlib import Path

from django.conf import settings
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from chats.models import Chat
from chats.permissions import can_access_chat

from .models import Message, NormalMessage
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


class AttachmentDownloadView(APIView):
    """GET /api/messages/<message_id>/attachment/."""

    def get(self, request, message_id):
        message = get_object_or_404(
            Message.objects.select_related("chat", "file"),
            pk=message_id,
            is_deleted=False,
        )
        if message.file_id is None:
            raise NotFound("Attachment not found.")
        if not can_access_chat(request.user, message.chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        absolute_path = _private_attachment_path(message.file.storage_path)
        if absolute_path is None or not absolute_path.is_file():
            raise NotFound("Attachment file is unavailable.")

        return FileResponse(
            absolute_path.open("rb"),
            as_attachment=True,
            filename=message.file.name,
            content_type=message.file.type or "application/octet-stream",
        )


def _validation_error_detail(error):
    if hasattr(error, "message_dict"):
        return error.message_dict
    if hasattr(error, "messages"):
        return error.messages
    return str(error)


def _private_attachment_path(storage_path):
    if not storage_path:
        return None

    root = Path(settings.PRIVATE_MEDIA_ROOT).resolve()
    absolute_path = (root / storage_path).resolve()
    if root != absolute_path and root not in absolute_path.parents:
        return None
    return absolute_path
