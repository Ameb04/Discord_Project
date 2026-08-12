from datetime import datetime, timedelta, timezone as datetime_timezone

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import User
from chats.models import Pv, PvMembership

from .models import ScheduledMessage
from .services import create_scheduled_text_message


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
