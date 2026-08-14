from rest_framework import serializers

from accounts.models import BIO_MAX_LENGTH
from accounts.serializers import PublicUserSerializer
from core.models import Tag, TagScope
from core.serializers import TagSerializer

from .models import AccessLevel, Channel, ChannelMembership, Group, Topic


# A room's name is read in a sidebar row, a chat header and a dialog title. The
# column holds 255, but a name that long is an ellipsis everywhere it appears,
# so the API caps what it will accept. Mirrored by
# `frontend/src/lib/profile.ts:ROOM_NAME_MAX_LENGTH`.
GROUP_NAME_MAX_LENGTH = 30
CHANNEL_NAME_MAX_LENGTH = 30
TOPIC_NAME_MAX_LENGTH = 30


def group_name_field(**kwargs):
    return serializers.CharField(max_length=GROUP_NAME_MAX_LENGTH, **kwargs)


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


class MuteStateMixin:
    """Supplies ``is_muted`` — has *this* viewer silenced this conversation.

    A list view puts the viewer's whole mute set in the serializer context, so
    rendering N rows stays one query instead of N. Anything that forgets to —
    a detail view serialising a single object — still answers correctly, just
    with a query of its own.

    Declaring the field is left to each serializer: DRF only collects declared
    fields from bases that are serializers themselves, and a mixin that has to
    be one to work is a mixin that stops mixing.
    """

    def _muted_viewer(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return None
        return user

    def _is_chat_muted(self, chat_id):
        from messaging.models import ChatMute

        prefetched = self.context.get("muted_chat_ids")
        if prefetched is not None:
            return chat_id in prefetched

        viewer = self._muted_viewer()
        if viewer is None:
            return False
        return ChatMute.objects.filter(chat_id=chat_id, user=viewer).exists()

    def _is_channel_muted(self, channel_id):
        from messaging.models import ChannelMute

        prefetched = self.context.get("muted_channel_ids")
        if prefetched is not None:
            return channel_id in prefetched

        viewer = self._muted_viewer()
        if viewer is None:
            return False
        return ChannelMute.objects.filter(
            channel_id=channel_id, user=viewer
        ).exists()


class UnreadStateMixin(MuteStateMixin):
    """Supplies ``unread_count`` and ``first_unread_message_id`` for a chat.

    Same prefetch-or-ask arrangement as the mute flags, and for the same
    reason: the sidebar renders every conversation the viewer has, so this must
    cost one query for the whole list rather than one per row.
    """

    def _unread_for(self, chat_id):
        from messaging.unread import unread_summaries

        prefetched = self.context.get("unread_by_chat")
        if prefetched is None:
            viewer = self._muted_viewer()
            prefetched = (
                unread_summaries(viewer, [chat_id]) if viewer is not None else {}
            )

        return prefetched.get(
            chat_id, {"unread_count": 0, "first_unread_message_id": None}
        )


class DirectChatRequestSerializer(serializers.Serializer):
    target_user = serializers.CharField()


class DirectChatSerializer(UnreadStateMixin, serializers.Serializer):
    id = serializers.IntegerField(source="pk")
    type = serializers.SerializerMethodField()
    created = serializers.SerializerMethodField()
    other_user = serializers.SerializerMethodField()
    is_muted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    first_unread_message_id = serializers.SerializerMethodField()

    def get_type(self, obj):
        return "direct"

    def get_is_muted(self, obj):
        return self._is_chat_muted(obj.pk)

    def get_unread_count(self, obj):
        return self._unread_for(obj.pk)["unread_count"]

    def get_first_unread_message_id(self, obj):
        return self._unread_for(obj.pk)["first_unread_message_id"]

    def get_created(self, obj):
        return bool(self.context["created"])

    def get_other_user(self, obj):
        other_user = self.context["other_user"]
        return PublicUserSerializer(
            other_user, context=self.context
        ).data


class GroupSummarySerializer(UnreadStateMixin, serializers.ModelSerializer):
    """A group as it appears in the conversation sidebar."""

    type = serializers.SerializerMethodField()
    tag = TagSerializer(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    is_muted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    first_unread_message_id = serializers.SerializerMethodField()

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
            "is_muted",
            "unread_count",
            "first_unread_message_id",
            "access_level",
            "allow_media",
        )

    def get_type(self, obj):
        return "group"

    def get_is_muted(self, obj):
        return self._is_chat_muted(obj.pk)

    def get_unread_count(self, obj):
        return self._unread_for(obj.pk)["unread_count"]

    def get_first_unread_message_id(self, obj):
        return self._unread_for(obj.pk)["first_unread_message_id"]

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
    name = group_name_field()
    bio = group_bio_field(required=False, default="")
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )


class GroupUpdateSerializer(serializers.Serializer):
    """Owner-only profile edit. Every field is optional and partial."""

    name = group_name_field(required=False)
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


# --------------------------------------------------------------------------
# Channels and topics
# --------------------------------------------------------------------------


class TopicSummarySerializer(UnreadStateMixin, serializers.ModelSerializer):
    """One topic as the channel's topic list and the sidebar know it."""

    type = serializers.SerializerMethodField()
    tag = TagSerializer(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    channel = serializers.PrimaryKeyRelatedField(read_only=True)
    is_muted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    first_unread_message_id = serializers.SerializerMethodField()

    class Meta:
        model = Topic
        fields = (
            "id",
            "type",
            "name",
            "bio",
            "tag",
            "avatar_url",
            "channel",
            "is_muted",
            "unread_count",
            "first_unread_message_id",
            "access_level",
            "allow_member_messages",
        )

    def get_unread_count(self, obj):
        return self._unread_for(obj.pk)["unread_count"]

    def get_first_unread_message_id(self, obj):
        return self._unread_for(obj.pk)["first_unread_message_id"]

    def get_type(self, obj):
        return "topic"

    def get_avatar_url(self, obj):
        return obj.avatar.url if obj.avatar else None

    def get_is_muted(self, obj):
        # This topic's own mute only. A channel-wide mute silences it too, but
        # that is the channel's flag to report — every surface that renders a
        # topic has the channel beside it, and collapsing the two here would
        # make "unmute this topic" look broken when the channel is the quiet one.
        return self._is_chat_muted(obj.pk)


class ChannelSummarySerializer(UnreadStateMixin, serializers.ModelSerializer):
    """A channel as it appears in the sidebar and the public directory.

    Carries the caller's own standing — member, admin, owner — because every
    surface that renders a channel immediately needs to know which controls to
    show, and asking separately would be a second round trip for every row.
    """

    type = serializers.SerializerMethodField()
    tag = TagSerializer(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    topic_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    is_muted = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = (
            "id",
            "type",
            "name",
            "bio",
            "tag",
            "avatar_url",
            "member_count",
            "topic_count",
            "is_owner",
            "is_admin",
            "is_member",
            "is_muted",
            "unread_count",
            "access_level",
            "allow_media",
        )

    def get_type(self, obj):
        return "channel"

    def get_is_muted(self, obj):
        return self._is_channel_muted(obj.pk)

    def get_unread_count(self, obj):
        """Everything unread across the topics inside.

        A channel holds no messages of its own, so its badge is the sum of the
        rooms it contains — which is the number that matters while the channel
        sits collapsed in the sidebar and its topics are out of sight.
        """
        if not self.get_is_member(obj):
            return 0

        return sum(
            self._unread_for(topic.pk)["unread_count"]
            for topic in obj.topics.all()
            if not topic.is_deleted
        )

    def get_avatar_url(self, obj):
        return obj.avatar.url if obj.avatar else None

    def get_member_count(self, obj):
        # Counts the prefetched rows when the caller supplied them, so a list
        # of N channels stays one query rather than N.
        return len(obj.members.all())

    def get_topic_count(self, obj):
        return sum(1 for topic in obj.topics.all() if not topic.is_deleted)

    def _viewer(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def get_is_owner(self, obj):
        viewer = self._viewer()
        return bool(viewer and obj.owner_id == viewer.pk)

    def get_is_admin(self, obj):
        viewer = self._viewer()
        if not viewer:
            return False
        if obj.owner_id == viewer.pk:
            return True
        return any(
            membership.user_id == viewer.pk and membership.is_admin
            for membership in obj.channelmembership_set.all()
        )

    def get_is_member(self, obj):
        viewer = self._viewer()
        if not viewer:
            return False
        if obj.owner_id == viewer.pk:
            return True
        return any(
            membership.user_id == viewer.pk
            for membership in obj.channelmembership_set.all()
        )


class ChannelMemberSerializer(serializers.ModelSerializer):
    """One participant, flagged with the role they hold."""

    user = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = ChannelMembership
        fields = ("user", "is_owner", "is_admin")

    def get_user(self, obj):
        return PublicUserSerializer(obj.user, context=self.context).data

    def get_is_owner(self, obj):
        return obj.user_id == obj.channel.owner_id

    def get_is_admin(self, obj):
        # The owner is an admin by definition; the stored flag is only about
        # the people they promoted.
        return obj.is_admin or obj.user_id == obj.channel.owner_id


class ChannelDetailSerializer(ChannelSummarySerializer):
    """The full channel profile: who is in it, and what is inside it."""

    owner = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    topics = serializers.SerializerMethodField()
    invite_link = serializers.SerializerMethodField()

    class Meta(ChannelSummarySerializer.Meta):
        fields = ChannelSummarySerializer.Meta.fields + (
            "owner",
            "members",
            "topics",
            "invite_link",
        )

    def get_owner(self, obj):
        return PublicUserSerializer(obj.owner, context=self.context).data

    def get_members(self, obj):
        # Who is in a channel is members-only, even when the channel itself is
        # public: a stranger browsing the directory is deciding whether to
        # join, and that decision does not need a roster of everyone inside.
        if not self.get_is_member(obj):
            return []

        memberships = sorted(
            obj.channelmembership_set.all(),
            # Owner first, then admins, then a stable alphabetical order.
            key=lambda membership: (
                membership.user_id != obj.owner_id,
                not membership.is_admin,
                f"{membership.user.first_name} {membership.user.last_name}"
                .strip()
                .lower(),
                str(membership.user_id),
            ),
        )
        return ChannelMemberSerializer(
            memberships, many=True, context=self.context
        ).data

    def get_topics(self, obj):
        topics = sorted(
            (topic for topic in obj.topics.all() if not topic.is_deleted),
            key=lambda topic: (topic.name.lower(), topic.pk),
        )
        return TopicSummarySerializer(topics, many=True, context=self.context).data

    def get_invite_link(self, obj):
        # Only the people who can rotate it have any use for it, and handing a
        # working invite to every member is a quiet way to lose control of a
        # private channel.
        return obj.link if self.get_is_admin(obj) else None


class ChannelCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=CHANNEL_NAME_MAX_LENGTH)
    bio = group_bio_field(required=False, default="")
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )


class ChannelUpdateSerializer(serializers.Serializer):
    """Admin-only profile edit. Every field is optional and partial."""

    name = serializers.CharField(max_length=CHANNEL_NAME_MAX_LENGTH, required=False)
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


class ChannelMemberAddSerializer(serializers.Serializer):
    user = serializers.CharField()


class ChannelAdminSerializer(serializers.Serializer):
    is_admin = serializers.BooleanField()


class TopicCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=TOPIC_NAME_MAX_LENGTH)
    bio = group_bio_field(required=False, default="")
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )
    allow_member_messages = serializers.BooleanField(required=False)


class TopicUpdateSerializer(serializers.Serializer):
    """Admin-only topic edit, including the posting lock."""

    name = serializers.CharField(max_length=TOPIC_NAME_MAX_LENGTH, required=False)
    bio = group_bio_field(required=False)
    tag = group_tag_field(required=False, allow_null=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    access_level = serializers.ChoiceField(
        choices=AccessLevel.choices, required=False
    )
    allow_member_messages = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("No editable fields were provided.")
        return attrs
