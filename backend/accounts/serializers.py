from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.models import Tag, TagScope
from core.serializers import TagSerializer

from .models import User


def user_tag_field(**kwargs):
    """A tag field that only accepts tags meant for people.

    Scoping the queryset rather than validating afterwards means a group tag
    is rejected as "does not exist", which is also the honest answer: it is
    not a choice this field offers.
    """
    return serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.filter(scope=TagScope.USER), **kwargs
    )


class RegisterSerializer(serializers.ModelSerializer):
    """Create a new account (requirement 4.1 - signup)."""

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = (
            "phone_number",
            "password",
            "first_name",
            "last_name",
            "gender",
            "bio",
        )
        extra_kwargs = {"bio": {"required": False, "allow_blank": True}}

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


class ChangePasswordSerializer(serializers.Serializer):
    """Validate and apply a password change for the current user."""

    current_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )
    new_password = serializers.CharField(
        write_only=True, validators=[validate_password], style={"input_type": "password"}
    )

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password must be different from the current one."}
            )
        return attrs

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class UserSerializer(serializers.ModelSerializer):
    """Full representation of the current user (private profile, 4.10)."""

    avatar_url = serializers.SerializerMethodField()
    tag = user_tag_field(required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "phone_number",
            "first_name",
            "last_name",
            "gender",
            "bio",
            "can_be_added_to_group",
            "can_be_added_to_channel",
            "avatar",
            "avatar_url",
            "tag",
        )
        read_only_fields = ("phone_number",)
        extra_kwargs = {
            "avatar": {"write_only": True, "required": False},
            "bio": {"required": False, "allow_blank": True},
        }

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
            "bio",
            "avatar_url",
            "tag",
        )

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        return obj.avatar.url
