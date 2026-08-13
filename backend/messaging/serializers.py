from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from accounts.serializers import PublicUserSerializer

from .models import NormalMessage, ScheduledMessage


class TextMessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(
        allow_blank=True,
        trim_whitespace=False,
    )


class MessageUpdateSerializer(serializers.Serializer):
    content = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    file = serializers.FileField(required=False, allow_null=True)
    remove_file = serializers.BooleanField(required=False, default=False)


class MediaMessageCreateSerializer(serializers.Serializer):
    file = serializers.FileField()
    content = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )


class NormalMessageSerializer(serializers.ModelSerializer):
    chat = serializers.PrimaryKeyRelatedField(read_only=True)
    sender = serializers.SerializerMethodField()
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = NormalMessage
        fields = ("id", "chat", "sender", "content", "sent_at", "is_edited", "attachment")

    def get_sender(self, obj):
        if obj.sender is None:
            return None
        return PublicUserSerializer(obj.sender, context=self.context).data

    def get_attachment(self, obj):
        if obj.file is None:
            return None
        return {
            "id": obj.file_id,
            "name": obj.file.name,
            "type": obj.file.type,
            "size": obj.file.size,
            "download_url": f"/api/messages/{obj.pk}/attachment/",
        }


class MessageSearchResultSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    preview = serializers.SerializerMethodField()

    class Meta:
        model = NormalMessage
        fields = ("id", "chat", "sender", "preview", "sent_at", "is_edited")

    def get_sender(self, obj):
        if obj.sender is None:
            return None
        return PublicUserSerializer(obj.sender, context=self.context).data

    def get_preview(self, obj):
        content = (obj.content or "").strip()
        if not content:
            return "(empty message)"
        if len(content) <= 180:
            return content
        return f"{content[:177].rstrip()}..."


class ScheduledMessageListSerializer(serializers.ModelSerializer):
    destination = serializers.SerializerMethodField()
    preview = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledMessage
        fields = ("id", "destination", "preview", "scheduled_at", "status")

    def get_destination(self, obj):
        chat = obj.chat

        try:
            direct_chat = chat.pv
        except ObjectDoesNotExist:
            direct_chat = None
        if direct_chat is not None:
            # Iterate the prefetched members rather than filtering in SQL, so a
            # list of N messages stays one query instead of N.
            other_user = next(
                (
                    member
                    for member in direct_chat.members.all()
                    if member.pk != obj.sender_id
                ),
                None,
            )
            if other_user is not None:
                full_name = f"{other_user.first_name} {other_user.last_name}".strip()
                name = full_name or other_user.phone_number
            else:
                name = chat.name or f"Direct chat #{chat.pk}"
            return {"id": chat.pk, "type": "direct", "name": name}

        try:
            group = chat.group
        except ObjectDoesNotExist:
            group = None
        if group is not None:
            return {
                "id": chat.pk,
                "type": "group",
                "name": group.name or f"Group #{chat.pk}",
            }

        try:
            topic = chat.topic
        except ObjectDoesNotExist:
            topic = None
        if topic is not None:
            topic_name = topic.name or topic.channel.name
            return {"id": chat.pk, "type": "topic", "name": topic_name}

        return {
            "id": chat.pk,
            "type": "chat",
            "name": chat.name or f"Chat #{chat.pk}",
        }

    def get_preview(self, obj):
        content = (obj.content or "").strip()
        if len(content) <= 180:
            return content
        return f"{content[:177].rstrip()}..."


class ScheduledTextMessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(allow_blank=True, trim_whitespace=False)
    scheduled_at = serializers.DateTimeField()


class ScheduledMessageSerializer(serializers.ModelSerializer):
    chat = serializers.PrimaryKeyRelatedField(read_only=True)
    sender = serializers.SerializerMethodField()

    class Meta:
        model = ScheduledMessage
        fields = ("id", "chat", "sender", "content", "created_at", "scheduled_at")

    def get_sender(self, obj):
        if obj.sender is None:
            return None
        return PublicUserSerializer(obj.sender, context=self.context).data

