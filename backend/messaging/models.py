from django.conf import settings
from django.db import models


class Message(models.Model):
    """Base message entity. NormalMessage / ScheduledMessage specialise it
    via class-table inheritance (each subclass has its own table)."""

    content = models.TextField(blank=True)
    is_deleted = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    chat = models.ForeignKey(
        "chats.Chat", on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="sent_messages",
    )
    reply_to = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replies",
    )
    file = models.ForeignKey(
        "core.File",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="messages",
    )

    class Meta:
        db_table = "messages"

    def __str__(self):
        return f"Message #{self.pk}"


class NormalMessage(Message):
    """A message delivered immediately."""

    message = models.OneToOneField(
        Message,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
        related_name="normal",
    )
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "normal_messages"


class ScheduledMessageStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"


class ScheduledMessage(Message):
    """A message queued to be sent at a future time."""

    message = models.OneToOneField(
        Message,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
        related_name="scheduled",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=ScheduledMessageStatus.choices,
        default=ScheduledMessageStatus.PENDING,
        db_index=True,
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)
    delivered_message = models.OneToOneField(
        NormalMessage,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="scheduled_source",
    )

    class Meta:
        db_table = "scheduled_messages"
