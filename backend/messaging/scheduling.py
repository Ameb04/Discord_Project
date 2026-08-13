"""Dispatch policy for scheduled messages: *when* a message reaches a worker.

Two mechanisms cooperate:

* **ETA hand-off** — a message is handed to the broker with an ``eta`` the
  moment it is created, so the worker fires it on the second rather than
  whenever the next poll happens to come round.
* **Sweeper** — a once-a-minute periodic task that pulls far-future messages
  into the ETA horizon as they approach and re-queues anything that went
  overdue (worker restart, dropped broker message, a row created while Redis
  was unreachable).

The two overlap on purpose. ``deliver_scheduled_message`` re-checks status
under ``SELECT ... FOR UPDATE``, so a message queued twice is still delivered
exactly once, which is what lets the safety net be blunt.

ETAs are deliberately kept shorter than the broker's visibility timeout. Redis
replays any message a worker has held longer than that window, so parking a
week-long ETA in the queue would have the broker re-deliver it every hour for
a week. Anything past the horizon waits in Postgres instead.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import ScheduledMessage, ScheduledMessageStatus


def dispatch_horizon():
    """How far ahead a message may sit in the broker as an ETA task."""
    return timedelta(seconds=settings.SCHEDULED_MESSAGE_DISPATCH_HORIZON_SECONDS)


def redispatch_after():
    """How long an overdue message may stay queued before we replace its task."""
    return timedelta(seconds=settings.SCHEDULED_MESSAGE_REDISPATCH_AFTER_SECONDS)


def enqueue_delivery(scheduled_message, *, now=None):
    """Queue ``scheduled_message`` to be delivered at its own ``scheduled_at``.

    Returns ``True`` when the message was handed to the broker, and ``False``
    when it is still too far out to park there — the sweeper will pick it up
    once it enters the horizon.
    """
    now = now or timezone.now()
    if scheduled_message.scheduled_at > now + dispatch_horizon():
        return False

    # Imported here rather than at module scope: tasks.py imports this module,
    # so a top-level import would close the cycle.
    from .tasks import deliver_scheduled_message_task

    deliver_scheduled_message_task.apply_async(
        (scheduled_message.pk,),
        eta=scheduled_message.scheduled_at,
    )
    ScheduledMessage.objects.filter(pk=scheduled_message.pk).update(dispatched_at=now)
    scheduled_message.dispatched_at = now
    return True


def enqueue_delivery_on_commit(scheduled_message):
    """Queue delivery once the creating transaction is durable.

    Enqueuing inline would race the worker: it can pick the id off the broker
    before the row is visible on any other connection, and then decide the
    message does not exist.
    """
    transaction.on_commit(lambda: enqueue_delivery(scheduled_message))


def messages_needing_dispatch(now=None):
    """Pending messages the sweeper should hand to the broker.

    Two independent reasons to pick one up:

    * it has entered the ETA horizon and has never been queued;
    * it is already overdue and still pending, so whatever was queued for it is
      gone and needs replacing.
    """
    now = now or timezone.now()

    entering_horizon = Q(
        dispatched_at__isnull=True,
        scheduled_at__lte=now + dispatch_horizon(),
    )
    stuck_overdue = Q(scheduled_at__lte=now) & (
        Q(dispatched_at__isnull=True)
        | Q(dispatched_at__lte=now - redispatch_after())
    )

    return (
        ScheduledMessage.objects.filter(status=ScheduledMessageStatus.PENDING)
        .filter(entering_horizon | stuck_overdue)
        .order_by("scheduled_at", "pk")
    )
