from datetime import datetime, timedelta, timezone as datetime_timezone
from unittest import mock

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import User
from chats.models import Pv, PvMembership

from .models import NormalMessage, ScheduledMessage, ScheduledMessageStatus
from .services import (
    cancel_scheduled_message,
    create_scheduled_text_message,
    deliver_scheduled_message,
)
from .tasks import dispatch_due_scheduled_messages


class ScheduledTextMessageTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.member = User.objects.create_user(
            phone_number="2000", password="password"
        )
        self.outsider = User.objects.create_user(
            phone_number="3000", password="password"
        )
        self.chat = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=self.chat, user=self.owner)
        PvMembership.objects.create(pv=self.chat, user=self.member)

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def url(self):
        return f"/api/chats/{self.chat.pk}/messages/scheduled/"

    def test_authenticated_user_can_schedule_future_text(self):
        scheduled_at = timezone.now() + timedelta(hours=2)

        response = self.authenticated_client(self.owner).post(
            self.url(),
            {"content": "  Future hello  ", "scheduled_at": scheduled_at.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        message = ScheduledMessage.objects.get()
        self.assertEqual(message.sender, self.owner)
        self.assertEqual(message.chat_id, self.chat.pk)
        self.assertEqual(message.content, "Future hello")
        self.assertEqual(response.data["id"], message.pk)

    def test_past_datetime_is_rejected(self):
        response = self.authenticated_client(self.owner).post(
            self.url(),
            {
                "content": "Too late",
                "scheduled_at": (timezone.now() - timedelta(minutes=1)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("scheduled_at", response.data)
        self.assertFalse(ScheduledMessage.objects.exists())

    def test_current_non_future_datetime_is_rejected_by_service(self):
        with self.assertRaises(ValidationError):
            create_scheduled_text_message(
                self.owner,
                self.chat,
                "Not future",
                timezone.now(),
            )

    def test_unauthorized_destination_is_rejected(self):
        response = self.authenticated_client(self.outsider).post(
            self.url(),
            {
                "content": "Secret",
                "scheduled_at": (timezone.now() + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ScheduledMessage.objects.exists())

    def test_service_rejects_unauthorized_destination(self):
        with self.assertRaises(PermissionDenied):
            create_scheduled_text_message(
                self.outsider,
                self.chat,
                "Secret",
                timezone.now() + timedelta(hours=1),
            )

    def test_offset_datetime_is_stored_as_aware_utc(self):
        offset = datetime_timezone(timedelta(hours=3, minutes=30))
        requested = datetime.now(offset) + timedelta(hours=2)

        message = create_scheduled_text_message(
            self.owner,
            self.chat,
            "Timezone test",
            requested,
        )
        message.refresh_from_db()

        self.assertTrue(timezone.is_aware(message.scheduled_at))
        self.assertEqual(message.scheduled_at.utcoffset(), timedelta(0))
        self.assertEqual(message.scheduled_at, requested.astimezone(datetime_timezone.utc))

    def test_empty_and_whitespace_text_are_rejected(self):
        future = timezone.now() + timedelta(hours=1)
        for content in ("", "   "):
            with self.subTest(content=content):
                response = self.authenticated_client(self.owner).post(
                    self.url(),
                    {"content": content, "scheduled_at": future.isoformat()},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
        self.assertFalse(ScheduledMessage.objects.exists())

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().post(
            self.url(),
            {
                "content": "No session",
                "scheduled_at": (timezone.now() + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class ScheduledMessageDeliveryTests(TestCase):
    def setUp(self):
        self.sender = User.objects.create_user(
            phone_number="5000", password="password"
        )
        self.recipient = User.objects.create_user(
            phone_number="6000", password="password"
        )
        self.chat = Pv.objects.create(name="Scheduled delivery chat")
        PvMembership.objects.create(pv=self.chat, user=self.sender)
        PvMembership.objects.create(pv=self.chat, user=self.recipient)

    def scheduled_message(self, *, due=True, content="Scheduled hello"):
        scheduled_at = timezone.now() + (
            -timedelta(minutes=1) if due else timedelta(hours=1)
        )
        return ScheduledMessage.objects.create(
            sender=self.sender,
            chat=self.chat,
            content=content,
            scheduled_at=scheduled_at,
        )

    def test_due_pending_message_is_delivered_and_marked_sent(self):
        scheduled = self.scheduled_message()

        result = deliver_scheduled_message(scheduled.pk)
        scheduled.refresh_from_db()

        self.assertEqual(result.pk, scheduled.pk)
        self.assertEqual(scheduled.status, ScheduledMessageStatus.SENT)
        self.assertIsNotNone(scheduled.processed_at)
        self.assertIsNotNone(scheduled.delivered_message_id)
        delivered = NormalMessage.objects.get(pk=scheduled.delivered_message_id)
        self.assertEqual(delivered.sender, self.sender)
        self.assertEqual(delivered.chat_id, self.chat.pk)
        self.assertEqual(delivered.content, scheduled.content)

    def test_future_pending_message_is_not_delivered_early(self):
        scheduled = self.scheduled_message(due=False)

        deliver_scheduled_message(scheduled.pk)
        scheduled.refresh_from_db()

        self.assertEqual(scheduled.status, ScheduledMessageStatus.PENDING)
        self.assertIsNone(scheduled.processed_at)
        self.assertIsNone(scheduled.delivered_message_id)
        self.assertFalse(NormalMessage.objects.exists())

    def test_sender_session_is_not_required_for_background_delivery(self):
        scheduled = self.scheduled_message()

        deliver_scheduled_message(scheduled.pk)

        self.assertEqual(NormalMessage.objects.count(), 1)

    def test_lost_permission_marks_failed_without_normal_message(self):
        scheduled = self.scheduled_message()
        PvMembership.objects.filter(pv=self.chat, user=self.sender).delete()

        deliver_scheduled_message(scheduled.pk)
        scheduled.refresh_from_db()

        self.assertEqual(scheduled.status, ScheduledMessageStatus.FAILED)
        self.assertIsNotNone(scheduled.processed_at)
        self.assertIn("permission", scheduled.failure_reason.lower())
        self.assertIsNone(scheduled.delivered_message_id)
        self.assertFalse(NormalMessage.objects.exists())

    def test_inactive_sender_marks_failed(self):
        scheduled = self.scheduled_message()
        self.sender.is_active = False
        self.sender.save(update_fields=["is_active"])

        deliver_scheduled_message(scheduled.pk)
        scheduled.refresh_from_db()

        self.assertEqual(scheduled.status, ScheduledMessageStatus.FAILED)
        self.assertIn("active sender", scheduled.failure_reason.lower())
        self.assertFalse(NormalMessage.objects.exists())

    def test_repeated_processing_creates_exactly_one_normal_message(self):
        scheduled = self.scheduled_message()

        deliver_scheduled_message(scheduled.pk)
        deliver_scheduled_message(scheduled.pk)
        deliver_scheduled_message(scheduled.pk)

        scheduled.refresh_from_db()
        self.assertEqual(scheduled.status, ScheduledMessageStatus.SENT)
        self.assertEqual(NormalMessage.objects.count(), 1)
        self.assertEqual(
            scheduled.delivered_message_id,
            NormalMessage.objects.get().pk,
        )

    def test_transient_failure_rolls_back_and_leaves_message_pending(self):
        scheduled = self.scheduled_message()

        with mock.patch(
            "messaging.services.create_text_message",
            side_effect=RuntimeError("temporary failure"),
        ):
            with self.assertRaises(RuntimeError):
                deliver_scheduled_message(scheduled.pk)

        scheduled.refresh_from_db()
        self.assertEqual(scheduled.status, ScheduledMessageStatus.PENDING)
        self.assertIsNone(scheduled.delivered_message_id)
        self.assertFalse(NormalMessage.objects.exists())

    def test_delivery_uses_normal_message_live_broadcast_path(self):
        scheduled = self.scheduled_message()

        with mock.patch(
            "messaging.services.broadcast_message_after_commit"
        ) as broadcast:
            deliver_scheduled_message(scheduled.pk)

        delivered = NormalMessage.objects.get()
        broadcast.assert_called_once_with(delivered)

    def test_dispatcher_only_enqueues_due_pending_messages(self):
        due = self.scheduled_message(content="Due")
        self.scheduled_message(due=False, content="Future")
        sent = self.scheduled_message(content="Already sent")
        sent.status = ScheduledMessageStatus.SENT
        sent.save(update_fields=["status"])

        with mock.patch(
            "messaging.tasks.deliver_scheduled_message_task.delay"
        ) as delay:
            count = dispatch_due_scheduled_messages()

        self.assertEqual(count, 1)
        delay.assert_called_once_with(due.pk)


class ScheduledMessageListTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone_number="7000",
            password="password",
            first_name="Schedule",
            last_name="Owner",
        )
        self.recipient = User.objects.create_user(
            phone_number="8000",
            password="password",
            first_name="Direct",
            last_name="Recipient",
        )
        self.other_user = User.objects.create_user(
            phone_number="9000", password="password"
        )
        self.chat = Pv.objects.create(name="Owner direct chat")
        PvMembership.objects.create(pv=self.chat, user=self.owner)
        PvMembership.objects.create(pv=self.chat, user=self.recipient)

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def create_message(
        self,
        *,
        sender=None,
        chat=None,
        status=ScheduledMessageStatus.PENDING,
    ):
        return ScheduledMessage.objects.create(
            sender=sender or self.owner,
            chat=chat or self.chat,
            content="A scheduled message with enough detail",
            scheduled_at=timezone.now() + timedelta(hours=2),
            status=status,
        )

    def test_user_sees_only_their_own_scheduled_messages_with_required_fields(self):
        own_messages = [
            self.create_message(status=ScheduledMessageStatus.PENDING),
            self.create_message(status=ScheduledMessageStatus.SENT),
            self.create_message(status=ScheduledMessageStatus.FAILED),
        ]
        other_chat = Pv.objects.create(name="Other direct chat")
        PvMembership.objects.create(pv=other_chat, user=self.other_user)
        PvMembership.objects.create(pv=other_chat, user=self.recipient)
        self.create_message(sender=self.other_user, chat=other_chat)

        response = self.authenticated_client(self.owner).get(
            "/api/messages/scheduled/",
            {"user": self.other_user.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in response.data},
            {message.pk for message in own_messages},
        )
        self.assertEqual(
            {item["status"] for item in response.data},
            {
                ScheduledMessageStatus.PENDING,
                ScheduledMessageStatus.SENT,
                ScheduledMessageStatus.FAILED,
            },
        )
        for item in response.data:
            self.assertEqual(
                set(item),
                {"id", "destination", "preview", "scheduled_at", "status"},
            )
            self.assertEqual(
                item["destination"],
                {
                    "id": self.chat.pk,
                    "type": "direct",
                    "name": "Direct Recipient",
                },
            )
            self.assertEqual(item["preview"], "A scheduled message with enough detail")
            represented_time = parse_datetime(item["scheduled_at"])
            self.assertIsNotNone(represented_time)
            self.assertTrue(timezone.is_aware(represented_time))

    def test_preview_is_bounded(self):
        message = self.create_message()
        message.content = "x" * 200
        message.save(update_fields=["content"])

        response = self.authenticated_client(self.owner).get(
            "/api/messages/scheduled/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data[0]["preview"]), 180)
        self.assertTrue(response.data[0]["preview"].endswith("..."))

    def test_endpoint_requires_authentication(self):
        response = APIClient().get("/api/messages/scheduled/")

        self.assertEqual(response.status_code, 403)


class ScheduledMessageCancellationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone_number="11000", password="password"
        )
        self.recipient = User.objects.create_user(
            phone_number="12000", password="password"
        )
        self.other_user = User.objects.create_user(
            phone_number="13000", password="password"
        )
        self.chat = Pv.objects.create(name="Cancellation chat")
        PvMembership.objects.create(pv=self.chat, user=self.owner)
        PvMembership.objects.create(pv=self.chat, user=self.recipient)

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def create_message(self, *, status=ScheduledMessageStatus.PENDING, due=False):
        scheduled_at = timezone.now() + (
            -timedelta(minutes=1) if due else timedelta(hours=1)
        )
        return ScheduledMessage.objects.create(
            sender=self.owner,
            chat=self.chat,
            content="Message to cancel",
            scheduled_at=scheduled_at,
            status=status,
        )

    def cancel_url(self, message):
        return f"/api/messages/scheduled/{message.pk}/"

    def test_owner_can_cancel_pending_message(self):
        message = self.create_message()

        response = self.authenticated_client(self.owner).delete(
            self.cancel_url(message)
        )
        message.refresh_from_db()

        self.assertEqual(response.status_code, 204)
        self.assertEqual(message.status, ScheduledMessageStatus.CANCELLED)
        self.assertIsNotNone(message.processed_at)

    def test_other_user_cannot_cancel_or_discover_message(self):
        message = self.create_message()

        response = self.authenticated_client(self.other_user).delete(
            self.cancel_url(message)
        )
        message.refresh_from_db()

        self.assertEqual(response.status_code, 404)
        self.assertEqual(message.status, ScheduledMessageStatus.PENDING)

    def test_sent_and_failed_messages_cannot_be_cancelled(self):
        for lifecycle_status in (
            ScheduledMessageStatus.SENT,
            ScheduledMessageStatus.FAILED,
        ):
            with self.subTest(status=lifecycle_status):
                message = self.create_message(status=lifecycle_status)

                response = self.authenticated_client(self.owner).delete(
                    self.cancel_url(message)
                )

                self.assertEqual(response.status_code, 400)
                message.refresh_from_db()
                self.assertEqual(message.status, lifecycle_status)

    def test_cancelled_due_message_is_never_delivered(self):
        message = self.create_message(due=True)

        cancelled = cancel_scheduled_message(self.owner, message.pk)
        delivery_result = deliver_scheduled_message(message.pk)
        message.refresh_from_db()

        self.assertEqual(cancelled.status, ScheduledMessageStatus.CANCELLED)
        self.assertEqual(delivery_result.status, ScheduledMessageStatus.CANCELLED)
        self.assertEqual(message.status, ScheduledMessageStatus.CANCELLED)
        self.assertFalse(NormalMessage.objects.exists())

    def test_delivery_that_wins_first_cannot_be_cancelled(self):
        message = self.create_message(due=True)
        deliver_scheduled_message(message.pk)

        response = self.authenticated_client(self.owner).delete(
            self.cancel_url(message)
        )
        message.refresh_from_db()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(message.status, ScheduledMessageStatus.SENT)
        self.assertEqual(NormalMessage.objects.count(), 1)

    def test_cancelled_message_is_excluded_from_list(self):
        cancelled = self.create_message()
        visible = self.create_message()
        cancel_scheduled_message(self.owner, cancelled.pk)

        response = self.authenticated_client(self.owner).get(
            "/api/messages/scheduled/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [visible.pk])

    def test_cancellation_requires_authentication(self):
        message = self.create_message()

        response = APIClient().delete(self.cancel_url(message))

        self.assertEqual(response.status_code, 403)
        message.refresh_from_db()
        self.assertEqual(message.status, ScheduledMessageStatus.PENDING)
