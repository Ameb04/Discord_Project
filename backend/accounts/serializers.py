from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.models import Tag
from core.serializers import TagSerializer

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    """Create a new account (requirement 4.1 - signup)."""

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("phone_number", "password", "first_name", "last_name", "gender")

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    """Validate credentials and expose the authenticated user (4.1 - login)."""

    phone_number = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["phone_number"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(
                "Invalid phone number or password.", code="authorization"
            )
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    """Full representation of the current user (private profile, 4.10)."""

    avatar_url = serializers.SerializerMethodField()
    tag = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = User
        fields = (
            "phone_number",
            "first_name",
            "last_name",
            "gender",
            "can_be_added_to_group",
            "avatar",
            "avatar_url",
            "tag",
        )
        read_only_fields = ("phone_number",)
        extra_kwargs = {"avatar": {"write_only": True, "required": False}}

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        return obj.avatar.url


class PublicUserSerializer(serializers.ModelSerializer):
    """Public profile shown to other users (no sensitive fields, 4.10)."""

    avatar_url = serializers.SerializerMethodField()
    tag = TagSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "phone_number",
            "first_name",
            "last_name",
            "gender",
            "avatar_url",
            "tag",
        )

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        return obj.avatar.url
