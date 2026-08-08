from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from core.api import domain_errors

from .models import Group, Pv
from .permissions import is_group_member, is_group_owner
from .serializers import (
    DirectChatRequestSerializer,
    DirectChatSerializer,
    GroupCreateSerializer,
    GroupDetailSerializer,
    GroupMemberAddSerializer,
    GroupSummarySerializer,
    GroupUpdateSerializer,
)
from .services import (
    add_group_member,
    create_group,
    delete_group,
    get_or_create_direct_chat,
    join_group_via_token,
    remove_group_member,
    update_group,
)


def _group_queryset():
    """Groups with everything the group serializers touch already loaded."""
    return (
        Group.objects.filter(is_deleted=False)
        .select_related("owner", "owner__tag", "tag")
        .prefetch_related(Prefetch("members", queryset=User.objects.select_related("tag")))
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