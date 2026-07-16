from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User

from .serializers import DirectChatRequestSerializer, DirectChatSerializer
from .services import get_or_create_direct_chat


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
