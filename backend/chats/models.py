from django.conf import settings
from django.db import models


class AccessLevel(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"


class Chat(models.Model):
    """Base chat entity. Topic / Pv / Group specialise it via class-table
    inheritance (each subclass gets its own table sharing this PK)."""

    name = models.CharField(max_length=255, blank=True)
    is_deleted = models.BooleanField(default=False)
    tag = models.ForeignKey(
        "core.Tag",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="chats",
    )

    class Meta:
        db_table = "chats"

    def __str__(self):
        return self.name or f"Chat #{self.pk}"


class Channel(models.Model):
    """A broadcast channel. Not a Chat subclass; topics live inside it."""

    name = models.CharField(max_length=255)
    bio = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    is_private = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_channels",
    )
    tag = models.ForeignKey(
        "core.Tag",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="channels",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="ChannelMembership",
        related_name="channels",
    )

    class Meta:
        db_table = "channels"

    def __str__(self):
        return self.name


class Topic(Chat):
    """A discussion topic that belongs to a channel."""

    chat = models.OneToOneField(
        Chat,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
        related_name="topic",
    )
    access_level = models.CharField(
        max_length=10, choices=AccessLevel.choices, default=AccessLevel.PUBLIC
    )
    channel = models.ForeignKey(
        Channel, on_delete=models.CASCADE, related_name="topics"
    )

    class Meta:
        db_table = "topics"


class Pv(Chat):
    """A private one-to-one conversation between exactly two users."""

    chat = models.OneToOneField(
        Chat,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
        related_name="pv",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="PvMembership",
        related_name="pvs",
    )

    class Meta:
        db_table = "pvs"


class Group(Chat):
    """A group chat owned by a user."""

    chat = models.OneToOneField(
        Chat,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
        related_name="group",
    )
    bio = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    access_level = models.CharField(
        max_length=10, choices=AccessLevel.choices, default=AccessLevel.PRIVATE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_groups",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="GroupMembership",
        related_name="chat_groups",
    )

    class Meta:
        db_table = "groups"


class ChannelMembership(models.Model):
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_admin = models.BooleanField(default=False)

    class Meta:
        db_table = "channel_memberships"
        constraints = [
            models.UniqueConstraint(
                fields=["channel", "user"], name="uq_channel_membership"
            )
        ]


class GroupMembership(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        db_table = "group_memberships"
        constraints = [
            models.UniqueConstraint(
                fields=["group", "user"], name="uq_group_membership"
            )
        ]


class PvMembership(models.Model):
    pv = models.ForeignKey(Pv, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        db_table = "pv_memberships"
        constraints = [
            models.UniqueConstraint(fields=["pv", "user"], name="uq_pv_membership")
        ]
