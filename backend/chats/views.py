from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User

from .models import Group, Pv
from .serializers import DirectChatRequestSerializer, DirectChatSerializer
from .services import get_or_create_direct_chat


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
            Group.objects.select_related("owner")
            .prefetch_related("members")
            .filter(Q(owner=request.user) | Q(members=request.user), is_deleted=False)
            .distinct()
            .order_by("name", "pk")
        )

        group_items = []
        for group in groups:
            group_items.append(
                {
                    "id": group.pk,
                    "type": "group",
                    "name": group.name,
                    "bio": group.bio,
                    "member_count": len(group.members.all()),
                    "is_owner": group.owner_id == request.user.pk,
                    "access_level": group.access_level,
                }
            )

        return Response(
            {
                "private_chats": private_chats,
                "groups": group_items,
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