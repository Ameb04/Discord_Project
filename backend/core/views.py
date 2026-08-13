from rest_framework import generics
from rest_framework.exceptions import ValidationError

from .models import Tag, TagScope
from .serializers import TagSerializer


class TagListView(generics.ListAPIView):
    """GET /api/tags/?scope=user|group — tags offered for one audience.

    Defaults to people tags, which is what the profile form asks for; the
    group form passes ``scope=group``, so the two lists never mix.
    """

    serializer_class = TagSerializer

    def get_queryset(self):
        scope = self.request.query_params.get("scope") or TagScope.USER
        if scope not in TagScope.values:
            raise ValidationError(
                {"scope": f"Must be one of: {', '.join(TagScope.values)}."}
            )
        return Tag.objects.filter(scope=scope).order_by("title")
