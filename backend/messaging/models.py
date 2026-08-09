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
    # When this message was last handed to the delivery queue. Null means no
    # worker knows about it yet, so the sweeper still owns it; a stale value on
    # an overdue message means its task was lost and needs replacing.
    dispatched_at = models.DateTimeField(null=True, blank=True)
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
        indexes = [
            # Serves the sweeper, which scans pending messages by due time once
            # a minute.
            models.Index(
                fields=("status", "scheduled_at"),
                name="scheduled_msg_due_idx",
            ),
        ]


class ChatReadState(models.Model):
    """How far one user has read in one chat.

    A high-water mark rather than a row per (message, reader): read receipts
    are monotonic, so one row per participant answers "has this been seen?"
    for every message at once, instead of growing with messages × members.

    ``last_read_message_id`` is a plain watermark, not a foreign key. It is
    compared numerically against message ids and must survive a message being
    purged, which a foreign key would either block or null out.
    """

    chat = models.ForeignKey(
        "chats.Chat", on_delete=models.CASCADE, related_name="read_states"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_read_states",
    )
    last_read_message_id = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chat_read_states"
        constraints = [
            models.UniqueConstraint(
                fields=["chat", "user"], name="uq_chat_read_state"
            )
        ]

    def __str__(self):
        return f"{self.user_id} read chat {self.chat_id} up to {self.last_read_message_id}"
