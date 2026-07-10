from rest_framework import generics

from .models import Tag
from .serializers import TagSerializer


class TagListView(generics.ListAPIView):
    """GET /api/tags/ — human-facing tags for profile selection."""

    serializer_class = TagSerializer
    queryset = Tag.objects.filter(for_humans=True).order_by("title")
