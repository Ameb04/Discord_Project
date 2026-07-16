from rest_framework import serializers

from accounts.serializers import PublicUserSerializer


class DirectChatRequestSerializer(serializers.Serializer):
    target_user = serializers.CharField()


class DirectChatSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="pk")
    type = serializers.SerializerMethodField()
    created = serializers.SerializerMethodField()
    other_user = serializers.SerializerMethodField()

    def get_type(self, obj):
        return "direct"

    def get_created(self, obj):
        return bool(self.context["created"])

    def get_other_user(self, obj):
        other_user = self.context["other_user"]
        return PublicUserSerializer(
            other_user, context=self.context
        ).data
