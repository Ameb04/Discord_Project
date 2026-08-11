from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from core.api import domain_errors

from .models import AccessLevel, Channel, ChannelMembership, Group, Pv, Topic
from .permissions import (
    can_discover_channel,
    is_channel_admin,
    is_channel_member,
    is_channel_owner,
    is_group_member,
    is_group_owner,
)
from .serializers import (
    ChannelAdminSerializer,
    ChannelCreateSerializer,
    ChannelDetailSerializer,
    ChannelMemberAddSerializer,
    ChannelSummarySerializer,
    ChannelUpdateSerializer,
    DirectChatRequestSerializer,
    DirectChatSerializer,
    GroupCreateSerializer,
    GroupDetailSerializer,
    GroupMemberAddSerializer,
    GroupSummarySerializer,
    GroupUpdateSerializer,
    TopicCreateSerializer,
    TopicSummarySerializer,
    TopicUpdateSerializer,
)
from .services import (
    add_channel_member,
    add_group_member,
    create_channel,
    create_group,
    create_topic,
    delete_channel,
    delete_group,
    delete_topic,
    get_or_create_direct_chat,
    join_channel_via_token,
    join_group_via_token,
    join_public_channel,
    remove_channel_member,
    remove_group_member,
    rotate_channel_invite,
    rotate_group_invite,
    set_channel_admin,
    update_channel,
    update_group,
    update_topic,
)

# How many channels the public directory will return for one query. Enough to
# browse, small enough that "list everything" is never a useful attack.
CHANNEL_DIRECTORY_LIMIT = 50


def _group_queryset():
    """Groups with everything the group serializers touch already loaded."""
    return (
        Group.objects.filter(is_deleted=False)
        .select_related("owner", "owner__tag", "tag")
        .prefetch_related(Prefetch("members", queryset=User.objects.select_related("tag")))
    )


def _channel_queryset():
    """Channels with everything the channel serializers touch already loaded."""
    return (
        Channel.objects.filter(is_deleted=False)
        .select_related("owner", "owner__tag", "tag")
        .prefetch_related(
            Prefetch("members", queryset=User.objects.select_related("tag")),
            Prefetch(
                "channelmembership_set",
                queryset=ChannelMembership.objects.select_related(
                    "user", "user__tag"
                ),
            ),
            Prefetch("topics", queryset=Topic.objects.select_related("tag")),
        )
    )


def _get_visible_channel(
    request, channel_id, *, admin_only=False, owner_only=False, preview=False
):
    """Fetch a channel the caller may act on, at the requested level of power.

    ``preview`` widens the gate to anyone who may merely *discover* the channel
    — a stranger looking at a public one. Everything else needs membership,
    with admin or ownership checked on top, so a stranger cannot tell "not
    allowed" from "does not exist" for a private channel.
    """
    channel = get_object_or_404(_channel_queryset(), pk=channel_id)

    if preview:
        if not can_discover_channel(request.user, channel):
            raise NotFound("This channel could not be found.")
    elif not is_channel_member(request.user, channel):
        if not can_discover_channel(request.user, channel):
            raise NotFound("This channel could not be found.")
        raise PermissionDenied("You are not a member of this channel.")

    if admin_only and not is_channel_admin(request.user, channel):
        raise PermissionDenied("Only channel admins can do this.")
    if owner_only and not is_channel_owner(request.user, channel):
        raise PermissionDenied("Only the channel owner can do this.")

    return channel


def _get_channel_topic(channel, topic_id):
    return get_object_or_404(
        Topic.objects.select_related("tag", "channel"),
        pk=topic_id,
        channel=channel,
        is_deleted=False,
    )


def _member_channels(user):
    return (
        _channel_queryset()
        .filter(Q(owner=user) | Q(members=user))
        .distinct()
        .order_by("name", "pk")
    )


def _get_visible_group(request, group_id, *, owner_only=False):
    """Fetch a group the caller may see, optionally requiring ownership.

    Membership is what makes a group visible at all; ownership is only checked
    on top of that, so a stranger cannot tell "not yours" from "does not exist".
    """
    group = get_object_or_404(_group_queryset(), pk=group_id)

    if not is_group_member(request.user, group):
        raise PermissionDenied("You are not a member of this group.")
    if owner_only and not is_group_owner(request.user, group):
        raise PermissionDenied("Only the group owner can do this.")

    return group


class ConversationListView(APIView):
    """GET /api/chats/ - return sidebar conversations for the current user."""

    def get(self, request):
        private_chats = []

        pvs = (
            Pv.objects.filter(members=request.user, is_deleted=False)
            .prefetch_related(
                Prefetch(
                    "members",
                    queryset=User.objects.select_related("tag"),
                )
            )
            .order_by("pk")
        )

        for pv in pvs:
            other_user = next(
                (member for member in pv.members.all() if member.pk != request.user.pk),
                None,
            )
            if other_user is None:
                continue

            private_chats.append(
                DirectChatSerializer(
                    pv,
                    context={
                        "request": request,
                        "created": False,
                        "other_user": other_user,
                    },
                ).data
            )

        groups = (
            _group_queryset()
            .filter(Q(owner=request.user) | Q(members=request.user))
            .distinct()
            .order_by("name", "pk")
        )

        return Response(
            {
                "private_chats": private_chats,
                "groups": GroupSummarySerializer(
                    groups, many=True, context={"request": request}
                ).data,
                # Channels arrive with their topics inline: the sidebar renders
                # each channel as an expandable row, and one round trip for the
                # whole tree beats one per channel the moment it is opened.
                "channels": ChannelDetailSerializer(
                    _member_channels(request.user),
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class DirectChatCreateView(APIView):
    """POST /api/chats/direct/ - create or open a direct chat."""

    def post(self, request):
        request_serializer = DirectChatRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        target_user = get_object_or_404(
            User.objects.select_related("tag"),
            pk=request_serializer.validated_data["target_user"],
        )

        try:
            pv, created = get_or_create_direct_chat(request.user, target_user)
        except ValueError as exc:
            return Response(
                {"target_user": [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = DirectChatSerializer(
            pv,
            context={
                "request": request,
                "created": created,
                "other_user": target_user,
            },
        )
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GroupListCreateView(APIView):
    """GET/POST /api/groups/ - list the caller's groups, or create one."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        groups = (
            _group_queryset()
            .filter(Q(owner=request.user) | Q(members=request.user))
            .distinct()
            .order_by("name", "pk")
        )
        return Response(
            GroupSummarySerializer(
                groups, many=True, context={"request": request}
            ).data
        )

    def post(self, request):
        request_serializer = GroupCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        validated_data = request_serializer.validated_data

        with domain_errors():
            group = create_group(
                request.user,
                name=validated_data["name"],
                bio=validated_data.get("bio", ""),
                tag=validated_data.get("tag"),
                avatar=validated_data.get("avatar"),
                access_level=validated_data.get("access_level"),
            )

        return Response(
            GroupDetailSerializer(group, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class GroupDetailView(APIView):
    """GET/PATCH/DELETE /api/groups/<group_id>/."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, group_id):
        group = _get_visible_group(request, group_id)
        return Response(
            GroupDetailSerializer(group, context={"request": request}).data
        )

    def patch(self, request, group_id):
        group = _get_visible_group(request, group_id, owner_only=True)

        request_serializer = GroupUpdateSerializer(data=request.data, partial=True)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            group = update_group(
                request.user, group, dict(request_serializer.validated_data)
            )

        return Response(
            GroupDetailSerializer(group, context={"request": request}).data
        )

    def delete(self, request, group_id):
        group = _get_visible_group(request, group_id, owner_only=True)

        with domain_errors():
            delete_group(request.user, group)

        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMemberCreateView(APIView):
    """POST /api/groups/<group_id>/members/ - owner adds a member by phone."""

    def post(self, request, group_id):
        group = _get_visible_group(request, group_id, owner_only=True)

        request_serializer = GroupMemberAddSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        target_user = get_object_or_404(
            User.objects.select_related("tag"),
            pk=request_serializer.validated_data["user"],
        )

        with domain_errors():
            _, created = add_group_member(request.user, group, target_user)

        # Re-read so the response carries the member that was just added.
        group = get_object_or_404(_group_queryset(), pk=group_id)
        return Response(
            GroupDetailSerializer(group, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GroupMemberDeleteView(APIView):
    """DELETE /api/groups/<group_id>/members/<phone_number>/ - owner removes."""

    def delete(self, request, group_id, phone_number):
        group = _get_visible_group(request, group_id, owner_only=True)
        target_user = get_object_or_404(User, pk=phone_number)

        with domain_errors():
            removed = remove_group_member(request.user, group, target_user)

        if not removed:
            raise NotFound("This user is not a member of the group.")

        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupInviteResetView(APIView):
    """POST /api/groups/<group_id>/invite/reset/ - owner rotates the link."""

    def post(self, request, group_id):
        group = _get_visible_group(request, group_id, owner_only=True)

        with domain_errors():
            rotate_group_invite(request.user, group)

        group = get_object_or_404(_group_queryset(), pk=group_id)
        return Response(
            GroupDetailSerializer(group, context={"request": request}).data
        )


class GroupJoinView(APIView):
    """GET/POST /api/groups/join/<token>/ - preview, then join via invite."""

    def get(self, request, token):
        group = get_object_or_404(_group_queryset(), link=token)
        return Response(
            {
                "id": group.pk,
                "name": group.name,
                "bio": group.bio,
                "avatar_url": group.avatar.url if group.avatar else None,
                "member_count": len(group.members.all()),
                "is_member": is_group_member(request.user, group),
            }
        )

    def post(self, request, token):
        with domain_errors():
            group, created = join_group_via_token(request.user, token)

        # The membership row the join just wrote is not on the prefetched
        # instance, so re-read before serialising the member list.
        group = get_object_or_404(_group_queryset(), pk=group.pk)
        return Response(
            GroupDetailSerializer(group, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# --------------------------------------------------------------------------
# Channels
# --------------------------------------------------------------------------


class ChannelListCreateView(APIView):
    """GET/POST /api/channels/ - list the caller's channels, or create one."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        return Response(
            ChannelDetailSerializer(
                _member_channels(request.user),
                many=True,
                context={"request": request},
            ).data
        )

    def post(self, request):
        request_serializer = ChannelCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        validated_data = request_serializer.validated_data

        with domain_errors():
            channel = create_channel(
                request.user,
                name=validated_data["name"],
                bio=validated_data.get("bio", ""),
                tag=validated_data.get("tag"),
                avatar=validated_data.get("avatar"),
                access_level=validated_data.get("access_level"),
            )

        channel = get_object_or_404(_channel_queryset(), pk=channel.pk)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ChannelDirectoryView(APIView):
    """GET /api/channels/discover/?q=... - browse public channels.

    Public channels are meant to be found, so this is open to any signed-in
    user. Private ones never appear here, whatever the query says.
    """

    def get(self, request):
        query = request.query_params.get("q", "").strip()

        channels = _channel_queryset().filter(access_level=AccessLevel.PUBLIC)
        if query:
            channels = channels.filter(
                Q(name__icontains=query) | Q(bio__icontains=query)
            )

        channels = channels.order_by("name", "pk")[:CHANNEL_DIRECTORY_LIMIT]
        return Response(
            ChannelSummarySerializer(
                channels, many=True, context={"request": request}
            ).data
        )


class ChannelDetailView(APIView):
    """GET/PATCH/DELETE /api/channels/<channel_id>/."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, channel_id):
        # Preview access on purpose: seeing what a public channel is and which
        # topics it holds is how someone decides whether to join it.
        channel = _get_visible_channel(request, channel_id, preview=True)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data
        )

    def patch(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)

        request_serializer = ChannelUpdateSerializer(data=request.data, partial=True)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            update_channel(
                request.user, channel, dict(request_serializer.validated_data)
            )

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data
        )

    def delete(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, owner_only=True)

        with domain_errors():
            delete_channel(request.user, channel)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ChannelInviteResetView(APIView):
    """POST /api/channels/<channel_id>/invite/reset/ - admin rotates the link."""

    def post(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)

        with domain_errors():
            rotate_channel_invite(request.user, channel)

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data
        )


class ChannelMemberCreateView(APIView):
    """POST /api/channels/<channel_id>/members/ - admin adds by phone number."""

    def post(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)

        request_serializer = ChannelMemberAddSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        target_user = get_object_or_404(
            User.objects.select_related("tag"),
            pk=request_serializer.validated_data["user"],
        )

        with domain_errors():
            _, created = add_channel_member(request.user, channel, target_user)

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ChannelMemberDetailView(APIView):
    """DELETE/PATCH /api/channels/<channel_id>/members/<phone_number>/.

    DELETE removes the member; PATCH is how the owner promotes or demotes an
    admin. Both live on the membership because that is the thing changing.
    """

    def delete(self, request, channel_id, phone_number):
        channel = _get_visible_channel(request, channel_id, admin_only=True)
        target_user = get_object_or_404(User, pk=phone_number)

        with domain_errors():
            removed = remove_channel_member(request.user, channel, target_user)

        if not removed:
            raise NotFound("This user is not a member of the channel.")

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data
        )

    def patch(self, request, channel_id, phone_number):
        channel = _get_visible_channel(request, channel_id, owner_only=True)
        target_user = get_object_or_404(User, pk=phone_number)

        request_serializer = ChannelAdminSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            set_channel_admin(
                request.user,
                channel,
                target_user,
                request_serializer.validated_data["is_admin"],
            )

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data
        )


class ChannelJoinView(APIView):
    """POST /api/channels/<channel_id>/join/ - join a public channel."""

    def post(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, preview=True)

        with domain_errors():
            _, created = join_public_channel(request.user, channel)

        channel = get_object_or_404(_channel_queryset(), pk=channel_id)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ChannelInviteJoinView(APIView):
    """GET/POST /api/channels/join/<token>/ - preview, then join via invite."""

    def get(self, request, token):
        channel = get_object_or_404(_channel_queryset(), link=token)
        return Response(
            {
                "id": channel.pk,
                "name": channel.name,
                "bio": channel.bio,
                "avatar_url": channel.avatar.url if channel.avatar else None,
                "member_count": len(channel.members.all()),
                "topic_count": sum(
                    1 for topic in channel.topics.all() if not topic.is_deleted
                ),
                "access_level": channel.access_level,
                "is_member": is_channel_member(request.user, channel),
            }
        )

    def post(self, request, token):
        with domain_errors():
            channel, created = join_channel_via_token(request.user, token)

        channel = get_object_or_404(_channel_queryset(), pk=channel.pk)
        return Response(
            ChannelDetailSerializer(channel, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class TopicListCreateView(APIView):
    """GET/POST /api/channels/<channel_id>/topics/."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, preview=True)
        topics = sorted(
            (topic for topic in channel.topics.all() if not topic.is_deleted),
            key=lambda topic: (topic.name.lower(), topic.pk),
        )
        return Response(
            TopicSummarySerializer(
                topics, many=True, context={"request": request}
            ).data
        )

    def post(self, request, channel_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)

        request_serializer = TopicCreateSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        validated_data = request_serializer.validated_data

        with domain_errors():
            topic = create_topic(
                request.user,
                channel,
                name=validated_data["name"],
                bio=validated_data.get("bio", ""),
                tag=validated_data.get("tag"),
                avatar=validated_data.get("avatar"),
                access_level=validated_data.get("access_level"),
                allow_member_messages=validated_data.get("allow_member_messages"),
            )

        return Response(
            TopicSummarySerializer(topic, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TopicDetailView(APIView):
    """GET/PATCH/DELETE /api/channels/<channel_id>/topics/<topic_id>/."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, channel_id, topic_id):
        channel = _get_visible_channel(request, channel_id, preview=True)
        topic = _get_channel_topic(channel, topic_id)
        return Response(
            TopicSummarySerializer(topic, context={"request": request}).data
        )

    def patch(self, request, channel_id, topic_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)
        topic = _get_channel_topic(channel, topic_id)

        request_serializer = TopicUpdateSerializer(data=request.data, partial=True)
        request_serializer.is_valid(raise_exception=True)

        with domain_errors():
            topic = update_topic(
                request.user, topic, dict(request_serializer.validated_data)
            )

        return Response(
            TopicSummarySerializer(topic, context={"request": request}).data
        )

    def delete(self, request, channel_id, topic_id):
        channel = _get_visible_channel(request, channel_id, admin_only=True)
        topic = _get_channel_topic(channel, topic_id)

        with domain_errors():
            delete_topic(request.user, topic)

        return Response(status=status.HTTP_204_NO_CONTENT)