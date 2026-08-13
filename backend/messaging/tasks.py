from celery import shared_task
from django.utils import timezone

from .models import ScheduledMessage, ScheduledMessageStatus
from .services import deliver_scheduled_message


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def deliver_scheduled_message_task(scheduled_message_id):
    delivered = deliver_scheduled_message(scheduled_message_id)
    return delivered.status if delivered is not None else None


@shared_task
def dispatch_due_scheduled_messages():
    due_ids = list(
        ScheduledMessage.objects.filter(
            status=ScheduledMessageStatus.PENDING,
            scheduled_at__lte=timezone.now(),
        ).values_list("pk", flat=True)
    )
    for scheduled_message_id in due_ids:
        deliver_scheduled_message_task.delay(scheduled_message_id)
    return len(due_ids)
