from django.db import models


class TagScope(models.TextChoices):
    """Who a tag may be attached to.

    A tag belongs to exactly one audience: labels meant for people are not
    offered when naming a group, and vice versa.
    """

    USER = "user", "People"
    GROUP = "group", "Groups & channels"


class Tag(models.Model):
    """A label that can be attached to users, chats and channels."""

    title = models.CharField(max_length=255)
    scope = models.CharField(
        max_length=10,
        choices=TagScope.choices,
        default=TagScope.USER,
        help_text="Whether this tag is offered for people or for groups/channels.",
    )

    class Meta:
        db_table = "tags"
        ordering = ("scope", "title")

    def __str__(self):
        return f"{self.title} ({self.get_scope_display()})"


class File(models.Model):
    """An uploaded file that can be attached to a message."""

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=100)
    link = models.URLField(max_length=1000, blank=True)
    storage_path = models.CharField(max_length=1000, blank=True)
    size = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "files"

    def __str__(self):
        return self.name
