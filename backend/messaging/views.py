from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from chats.models import Chat
from chats.permissions import can_access_chat

from .models import (
    Message,
    NormalMessage,
    ScheduledMessage,
    ScheduledMessageStatus,
)
from .serializers import (
    MediaMessageCreateSerializer,
    MessageSearchResultSerializer,
    MessageUpdateSerializer,
    NormalMessageSerializer,
    ScheduledMessageListSerializer,
    ScheduledMessageSerializer,
    ScheduledTextMessageCreateSerializer,
    TextMessageCreateSerializer,
)
from .services import (
    cancel_scheduled_message,
    create_media_message,
    create_scheduled_text_message,
    create_text_message,
    edit_message,
    get_private_storage,
)


def _accessible_messages_queryset(chat):
    return (
        NormalMessage.objects.filter(chat=chat, is_deleted=False)
        .select_related("sender", "sender__tag", "file")
        .order_by("sent_at", "pk")
    )


def _ordered_message_ids(chat):
    return list(_accessible_messages_queryset(chat).values_list("pk", flat=True))


def _parse_positive_int(value, *, default, field_name, min_value=1, max_value=100):
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError({field_name: "Must be a positive integer."})
    if parsed < min_value:
        raise ValidationError({field_name: f"Must be at least {min_value}."})
    if parsed > max_value:
        raise ValidationError({field_name: f"Must be at most {max_value}."})
    return parsed


def _serialise_window(chat, message_ids, request, focus_message_id=None):
    queryset = _accessible_messages_queryset(chat).filter(pk__in=message_ids)
    ordered_messages = list(queryset.order_by("sent_at", "pk"))
    response = {
        "results": NormalMessageSerializer(
            ordered_messages, many=True, context={"request": request}
        ).data,
        "count": len(message_ids),
        "has_older": False,
        "has_newer": False,
        "oldest_message_id": ordered_messages[0].pk if ordered_messages else None,
        "newest_message_id": ordered_messages[-1].pk if ordered_messages else None,
    }
    if focus_message_id is not None:
        response["focus_message_id"] = focus_message_id
    return response


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


class MessageHistoryView(APIView):
    """GET /api/chats/<chat_id>/messages/history/."""

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        all_ids = _ordered_message_ids(chat)
        limit = _parse_positive_int(
            request.query_params.get("limit"),
            default=20,
            field_name="limit",
            min_value=1,
            max_value=100,
        )

        if not all_ids:
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "has_older": False,
                    "has_newer": False,
                    "oldest_message_id": None,
                    "newest_message_id": None,
                }
            )

        before = request.query_params.get("before")
        if before not in (None, ""):
            try:
                before_id = int(before)
            except (TypeError, ValueError):
                raise ValidationError({"before": "Must be a positive integer."})
            if before_id not in all_ids:
                raise NotFound("Message not found.")
            end = all_ids.index(before_id)
            start = max(0, end - limit)
            selected_ids = all_ids[start:end]
            has_older = start > 0
            has_newer = end < len(all_ids)
        else:
            selected_ids = all_ids[-limit:]
            has_older = len(all_ids) > len(selected_ids)
            has_newer = False

        payload = _serialise_window(chat, selected_ids, request)
        payload.update(
            {
                "count": len(all_ids),
                "has_older": has_older,
                "has_newer": has_newer,
            }
        )
        return Response(payload)


class ScheduledMessageCreateView(APIView):
    """POST /api/chats/<chat_id>/messages/scheduled/."""

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        request_serializer = ScheduledTextMessageCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        try:
            message = create_scheduled_text_message(
                request.user,
                chat,
                request_serializer.validated_data["content"],
                request_serializer.validated_data["scheduled_at"],
            )
        except DjangoValidationError as exc:
            raise ValidationError(_validation_error_detail(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        response_serializer = ScheduledMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ScheduledMessageListView(APIView):
    """GET /api/messages/scheduled/."""

    def get(self, request):
        messages = (
            ScheduledMessage.objects.filter(sender=request.user).exclude(
                status=ScheduledMessageStatus.CANCELLED
            )
            .select_related(
                "chat", "chat__pv", "chat__group", "chat__topic__channel"
            )
            .order_by("scheduled_at", "pk")
        )
        serializer = ScheduledMessageListSerializer(
            messages, many=True, context={"request": request}
        )
        return Response(serializer.data)


class ScheduledMessageCancelView(APIView):
    """DELETE /api/messages/scheduled/<message_id>/."""

    def delete(self, request, message_id):
        try:
            message = cancel_scheduled_message(request.user, message_id)
        except DjangoValidationError as exc:
            raise ValidationError(_validation_error_detail(exc)) from exc

        if message is None:
            raise NotFound("Scheduled message not found.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageSearchView(APIView):
    """GET /api/chats/<chat_id>/messages/search/?q=..."""

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        query = request.query_params.get("q", "").strip()
        if not query:
            return Response({"query": "", "count": 0, "results": []})

        queryset = _accessible_messages_queryset(chat).filter(content__icontains=query)
        total_count = queryset.count()
        matched_messages = queryset.order_by("-sent_at", "-pk")[:50]
        serializer = MessageSearchResultSerializer(
            matched_messages, many=True, context={"request": request}
        )
        return Response(
            {
                "query": query,
                "count": total_count,
                "results": serializer.data,
            }
        )


class MessageContextView(APIView):
    """GET /api/chats/<chat_id>/messages/<message_id>/context/."""

    def get(self, request, chat_id, message_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        all_ids = _ordered_message_ids(chat)
        if message_id not in all_ids:
            raise NotFound("Message not found.")

        window = _parse_positive_int(
            request.query_params.get("window"),
            default=20,
            field_name="window",
            min_value=3,
            max_value=100,
        )

        center_index = all_ids.index(message_id)
        half_window = max(1, window // 2)
        start = max(0, center_index - half_window)
        end = min(len(all_ids), start + window)
        start = max(0, end - window)
        selected_ids = all_ids[start:end]

        payload = _serialise_window(chat, selected_ids, request, focus_message_id=message_id)
        payload["has_older"] = start > 0
        payload["has_newer"] = end < len(all_ids)
        return Response(payload)


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


class MessageUpdateView(APIView):
    """PATCH /api/chats/<chat_id>/messages/<message_id>/."""

    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, chat_id, message_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        # Data from form-data can have 'true'/'false' for booleans, DRF handles it
        # but if using JSON, it handles native booleans.
        request_serializer = MessageUpdateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        validated_data = request_serializer.validated_data

        # We need to distinguish between missing and None for content
        content = validated_data.get("content")
        if "content" not in request.data:
            content = None

        remove_file = validated_data.get("remove_file", False)
        if str(request.data.get("remove_file", "")).lower() == "true":
            remove_file = True

        try:
            message = edit_message(
                request.user,
                chat,
                message_id,
                content=content,
                uploaded_file=validated_data.get("file"),
                remove_file=remove_file,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_validation_error_detail(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        response_serializer = NormalMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)


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

        storage = get_private_storage()
        storage_path = message.file.storage_path
        if not storage_path or not storage.exists(storage_path):
            raise NotFound("Attachment file is unavailable.")

        return FileResponse(
            storage.open(storage_path, "rb"),
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
