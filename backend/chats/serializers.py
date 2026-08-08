from rest_framework import serializers

from accounts.models import BIO_MAX_LENGTH
from accounts.serializers import PublicUserSerializer
from core.models import Tag, TagScope
from core.serializers import TagSerializer

from .models import AccessLevel, Group


def group_tag_field(**kwargs):
    """A tag field that only accepts tags meant for groups and channels."""
    return serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.filter(scope=TagScope.GROUP), **kwargs
    )


def group_bio_field(**kwargs):
    return serializers.CharField(
        max_length=BIO_MAX_LENGTH,
        allow_blank=True,
        trim_whitespace=False,
        **kwargs,
    )


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


class GroupSummarySerializer(serializers.ModelSerializer):
    """A group as it appears in the conversation sidebar."""

    type = serializers.SerializerMethodField()
    tag = TagSerializer(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = (
            "id",
            "type",
            "name",
            "bio",
            "tag",
            "avatar_url",
            "member_count",
            "is_owner",
            "access_level",
            "allow_media",
        )

    def get_type(self, obj):
        return "group"

    def get_avatar_url(self, obj):
        return obj.avatar.url if obj.avatar else None

    def get_member_count(self, obj):
        # Counts the prefetched rows when the caller supplied them, so a list
        # of N groups stays one query rather than N.
        return len(obj.members.all())

    def get_is_owner(self, obj):
        request = self.context.get("request")
        return bool(request and obj.owner_id == request.user.pk)


class GroupMemberSerializer(serializers.Serializer):
    """One participant, flagged when they are the owner."""

    user = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    def get_user(self, obj):
        return PublicUserSerializer(obj, context=self.context).data

    def get_is_owner(self, obj):
        return obj.pk == self.context["group"].owner_id


class GroupDetailSerializer(GroupSummarySerializer):
    """The full group profile shown when a member opens the group's name."""

    owner = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    invite_link = serializers.SerializerMethodField()

    class Meta(GroupSummarySerializer.Meta):
        fields = GroupSummarySerializer.Meta.fields + (
            "owner",
            "members",
            "invite_link",
        )

    def get_owner(self, obj):
        return PublicUserSerializer(obj.owner, context=self.context).data

    def get_members(self, obj):
        members = sorted(
            obj.members.all(),
            # Owner first, then a stable alphabetical order.
            key=lambda member: (
                member.pk != obj.owner_id,
                f"{member.first_name} {member.last_name}".strip().lower(),
                str(member.pk),
            ),
        )
        return GroupMemberSerializer(
            members, many=True, context={**self.context, "group": obj}
        ).data

    def get_invite_link(self, obj):
        return obj.link or None


class GroupCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    bio = group_bio_field(required=False, default="")
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )


class GroupUpdateSerializer(serializers.Serializer):
    """Owner-only profile edit. Every field is optional and partial."""

    name = serializers.CharField(max_length=255, required=False)
    bio = group_bio_field(required=False)
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    allow_media = serializers.BooleanField(required=False)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("No editable fields were provided.")
        return attrs


class GroupMemberAddSerializer(serializers.Serializer):
    user = serializers.CharField()
