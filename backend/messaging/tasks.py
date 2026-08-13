import logging

from celery import shared_task
from django.utils import timezone

from .scheduling import enqueue_delivery, messages_needing_dispatch
from .services import deliver_scheduled_message

logger = logging.getLogger(__name__)


@shared_task(
    acks_late=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
    soft_time_limit=30,
    time_limit=60,
)
def deliver_scheduled_message_task(scheduled_message_id):
    """Deliver one scheduled message.

    Safe to run more than once for the same message: the service re-checks
    status under a row lock, so redundant runs are no-ops. That is what lets
    both the ETA hand-off and the sweeper aim at the same message.
    """
    delivered = deliver_scheduled_message(scheduled_message_id)
    if delivered is None:
        logger.warning(
            "Scheduled message %s disappeared before delivery.", scheduled_message_id
        )
        return None
    return delivered.status


@shared_task(ignore_result=True)
def dispatch_due_scheduled_messages():
    """Reconciliation sweep: queue whatever the ETA hand-off missed or lost.

    Returns the number of messages handed to the broker, which is normally zero
    on a healthy system — messages are queued at creation time, and this only
    catches the ones scheduled beyond the ETA horizon or stranded by a restart.
    """
    now = timezone.now()
    candidates = messages_needing_dispatch(now).only(
        "pk", "scheduled_at", "dispatched_at"
    )

    dispatched = sum(
        1
        for scheduled_message in candidates.iterator()
        if enqueue_delivery(scheduled_message, now=now)
    )

    if dispatched:
        logger.info("Sweep queued %s scheduled message(s).", dispatched)
    return dispatched
