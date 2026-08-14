from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from chats.models import Channel, Chat
from chats.permissions import can_access_chat
from core.api import domain_errors

from .models import (
    Message,
    NormalMessage,
    ScheduledMessage,
    ScheduledMessageStatus,
)
from .mutes import set_channel_mute, set_chat_mute
from .unread import unread_summary
from .serializers import (
    MarkReadSerializer,
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
    delete_message,
    edit_message,
    get_chat_read_state,
    get_private_storage,
    mark_chat_read,
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

        serializer = NormalMessageSerializer(
            _accessible_messages_queryset(chat),
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        request_serializer = TextMessageCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            message = create_text_message(
                request.user,
                chat,
                request_serializer.validated_data["content"],
            )

        response_serializer = NormalMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class MessageHistoryView(APIView):
    """GET /api/chats/<chat_id>/messages/history/.

    Three ways to pick the window, in the order they are checked:

    * ``before=<id>`` — the page above that message, for scrolling back.
    * ``after=<id>`` — the page below it, for scrolling forward out of a window
      that started somewhere other than the end.
    * ``anchor=unread`` — start where the reader left off rather than at the
      end, so the first thing they have not seen is on screen.

    Every response carries the unread state as of *this request*, read before
    anything marks the chat as seen. That ordering is the whole contract: the
    client draws its "unread from here" line from this number, and if the read
    watermark had already moved the line would have nowhere to go.
    """

    # A few messages of already-read context above the unread run, so the first
    # new message lands with something to sit against rather than flush against
    # the top edge.
    UNREAD_CONTEXT_LEAD = 3

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

        unread = unread_summary(request.user, chat)

        if not all_ids:
            return Response(
                {
                    "results": [],
                    "count": 0,
                    "has_older": False,
                    "has_newer": False,
                    "oldest_message_id": None,
                    "newest_message_id": None,
                    **unread,
                }
            )

        start, end = self._select_window(request, all_ids, limit, unread)
        selected_ids = all_ids[start:end]

        payload = _serialise_window(chat, selected_ids, request)
        payload.update(
            {
                "count": len(all_ids),
                "has_older": start > 0,
                "has_newer": end < len(all_ids),
                **unread,
            }
        )
        return Response(payload)

    def _select_window(self, request, all_ids, limit, unread):
        """Return the ``[start, end)`` slice of ``all_ids`` to serialise."""
        before = self._cursor(request, "before", all_ids)
        if before is not None:
            end = all_ids.index(before)
            return max(0, end - limit), end

        after = self._cursor(request, "after", all_ids)
        if after is not None:
            start = all_ids.index(after) + 1
            return start, min(len(all_ids), start + limit)

        first_unread_id = unread["first_unread_message_id"]
        if request.query_params.get("anchor") == "unread" and first_unread_id in all_ids:
            lead = all_ids.index(first_unread_id) - self.UNREAD_CONTEXT_LEAD
            start = max(0, lead)
            end = min(len(all_ids), start + limit)
            # Pull back when the run is short enough that the window would
            # otherwise hang off the end with blank space behind it.
            return max(0, end - limit), end

        # Nothing asked for in particular: the newest page, because a chat is a
        # place you return to rather than a document you read from the top.
        return max(0, len(all_ids) - limit), len(all_ids)

    def _cursor(self, request, name, all_ids):
        raw = request.query_params.get(name)
        if raw in (None, ""):
            return None
        try:
            message_id = int(raw)
        except (TypeError, ValueError):
            raise ValidationError({name: "Must be a positive integer."})
        if message_id not in all_ids:
            raise NotFound("Message not found.")
        return message_id


class ScheduledMessageCreateView(APIView):
    """POST /api/chats/<chat_id>/messages/scheduled/."""

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        request_serializer = ScheduledTextMessageCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            message = create_scheduled_text_message(
                request.user,
                chat,
                request_serializer.validated_data["content"],
                request_serializer.validated_data["scheduled_at"],
            )

        response_serializer = ScheduledMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ScheduledMessageListView(APIView):
    """GET /api/messages/scheduled/."""

    def get(self, request):
        messages = (
            ScheduledMessage.objects.filter(sender=request.user)
            .exclude(status=ScheduledMessageStatus.CANCELLED)
            .select_related(
                "chat", "chat__pv", "chat__group", "chat__topic__channel"
            )
            # The direct-chat destination name comes from the *other* member, so
            # prefetch members rather than querying once per listed message.
            .prefetch_related("chat__pv__members")
            .order_by("scheduled_at", "pk")
        )
        serializer = ScheduledMessageListSerializer(
            messages, many=True, context={"request": request}
        )
        return Response(serializer.data)


class ScheduledMessageCancelView(APIView):
    """DELETE /api/messages/scheduled/<message_id>/."""

    def delete(self, request, message_id):
        with domain_errors():
            message = cancel_scheduled_message(request.user, message_id)

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

        with domain_errors():
            message = create_media_message(
                request.user,
                chat,
                request_serializer.validated_data["file"],
                request_serializer.validated_data.get("content", ""),
            )

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

        request_serializer = MessageUpdateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        validated_data = request_serializer.validated_data

        with domain_errors():
            message = edit_message(
                request.user,
                chat,
                message_id,
                # Omitted content means "leave the text alone"; an empty string
                # means "clear it", so the two must not collapse into one value.
                content=validated_data.get("content"),
                uploaded_file=validated_data.get("file"),
                remove_file=validated_data["remove_file"],
            )

        response_serializer = NormalMessageSerializer(
            message, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, chat_id, message_id):
        chat = get_object_or_404(Chat, pk=chat_id)
        if not can_access_chat(request.user, chat):
            raise PermissionDenied("You do not have permission to access this chat.")

        with domain_errors():
            delete_message(request.user, chat, message_id)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatReadStateView(APIView):
    """GET/POST /api/chats/<chat_id>/messages/read/ - read receipts."""

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)

        with domain_errors():
            return Response(get_chat_read_state(request.user, chat))

    def post(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)

        request_serializer = MarkReadSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            last_read_message_id = mark_chat_read(
                request.user,
                chat,
                # Omitted means "everything visible right now", which is what a
                # client that just rendered the whole conversation means.
                request_serializer.validated_data.get("message_id"),
            )

        return Response({"last_read_message_id": last_read_message_id})


class ChatMuteView(APIView):
    """PUT/DELETE /api/chats/<chat_id>/mute/ - silence one conversation.

    PUT mutes and DELETE unmutes, so the verb carries the intent and repeating
    either one is harmless — which matters for a toggle that a double click can
    easily fire twice.
    """

    def put(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)

        with domain_errors():
            set_chat_mute(request.user, chat, True)

        return Response({"is_muted": True})

    def delete(self, request, chat_id):
        chat = get_object_or_404(Chat, pk=chat_id)

        with domain_errors():
            set_chat_mute(request.user, chat, False)

        return Response({"is_muted": False})


class ChannelMuteView(APIView):
    """PUT/DELETE /api/channels/<channel_id>/mute/ - silence every topic."""

    def put(self, request, channel_id):
        channel = get_object_or_404(Channel, pk=channel_id, is_deleted=False)

        with domain_errors():
            set_channel_mute(request.user, channel, True)

        return Response({"is_muted": True})

    def delete(self, request, channel_id):
        channel = get_object_or_404(Channel, pk=channel_id, is_deleted=False)

        with domain_errors():
            set_channel_mute(request.user, channel, False)

        return Response({"is_muted": False})


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
