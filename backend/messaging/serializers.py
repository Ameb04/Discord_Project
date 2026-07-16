from rest_framework import serializers

from accounts.serializers import PublicUserSerializer

from .models import NormalMessage


class TextMessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(
        allow_blank=True,
        trim_whitespace=False,
    )


class NormalMessageSerializer(serializers.ModelSerializer):
    chat = serializers.PrimaryKeyRelatedField(read_only=True)
    sender = serializers.SerializerMethodField()
    attachment = serializers.SerializerMethodField()

    class Meta:
        model = NormalMessage
        fields = ("id", "chat", "sender", "content", "sent_at", "attachment")

    def get_sender(self, obj):
        if obj.sender is None:
            return None
        return PublicUserSerializer(obj.sender, context=self.context).data

    def get_attachment(self, obj):
        return None
