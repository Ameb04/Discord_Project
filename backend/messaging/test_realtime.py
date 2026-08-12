from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.sessions.backends.db import SessionStore
from django.db import transaction
from django.test import TransactionTestCase, override_settings

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import User
from chats.models import Pv, PvMembership
from config.asgi import application

from .models import NormalMessage
from .serializers import NormalMessageSerializer
from .services import create_text_message


TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class ChatMessageWebSocketTests(TransactionTestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.bob = User.objects.create_user(
            phone_number="2000", password="password"
        )
        self.outsider = User.objects.create_user(
            phone_number="3000", password="password"
        )
        self.outsider_peer = User.objects.create_user(
            phone_number="4000", password="password"
        )

        self.chat = Pv.objects.create(name="Alice and Bob")
        PvMembership.objects.create(pv=self.chat, user=self.alice)
        PvMembership.objects.create(pv=self.chat, user=self.bob)

        self.other_chat = Pv.objects.create(name="Another conversation")
        PvMembership.objects.create(pv=self.other_chat, user=self.outsider)
        PvMembership.objects.create(pv=self.other_chat, user=self.outsider_peer)

        self.alice_headers = self._session_headers(self.alice)
        self.bob_headers = self._session_headers(self.bob)
        self.outsider_headers = self._session_headers(self.outsider)

    def _session_headers(self, user):
        session = SessionStore()
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        cookie = f"{settings.SESSION_COOKIE_NAME}={session.session_key}"
        return [(b"cookie", cookie.encode("ascii"))]

    def _communicator(self, chat, headers=None):
        return WebsocketCommunicator(
            application,
            f"/ws/chats/{chat.pk}/",
            headers=headers,
        )

    async def test_authenticated_authorized_user_can_connect(self):
        communicator = self._communicator(self.chat, self.alice_headers)

        connected, subprotocol = await communicator.connect()

        self.assertTrue(connected)
        self.assertIsNone(subprotocol)
        await communicator.disconnect()

    async def test_unauthenticated_user_cannot_connect(self):
        communicator = self._communicator(self.chat)

        connected, close_code = await communicator.connect()

        self.assertFalse(connected)
        self.assertEqual(close_code, 4401)

    async def test_user_without_chat_access_cannot_connect(self):
        communicator = self._communicator(self.chat, self.outsider_headers)

        connected, close_code = await communicator.connect()

        self.assertFalse(connected)
        self.assertEqual(close_code, 4403)

    async def test_nonexistent_chat_cannot_connect(self):
        communicator = WebsocketCommunicator(
            application,
            "/ws/chats/999999/",
            headers=self.alice_headers,
        )

        connected, close_code = await communicator.connect()

        self.assertFalse(connected)
        self.assertEqual(close_code, 4403)

    async def test_created_message_emits_canonical_payload(self):
        communicator = self._communicator(self.chat, self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        message = await database_sync_to_async(create_text_message)(
            self.alice,
            self.chat,
            "Live hello",
        )
        event = await communicator.receive_json_from()
        expected_payload = await database_sync_to_async(self._serialize_message)(
            message.pk
        )

        self.assertEqual(event["type"], "message.created")
        self.assertEqual(event["message"], expected_payload)
        self.assertEqual(event["message"]["id"], message.pk)
        self.assertEqual(event["message"]["chat"], self.chat.pk)
        await communicator.disconnect()

    async def test_message_event_is_isolated_to_its_chat_group(self):
        recipient = self._communicator(self.chat, self.bob_headers)
        other_chat_listener = self._communicator(
            self.other_chat,
            self.outsider_headers,
        )
        recipient_connected, _ = await recipient.connect()
        outsider_connected, _ = await other_chat_listener.connect()
        self.assertTrue(recipient_connected)
        self.assertTrue(outsider_connected)

        await database_sync_to_async(create_text_message)(
            self.alice,
            self.chat,
            "For this chat only",
        )

        self.assertEqual(
            (await recipient.receive_json_from())["message"]["chat"],
            self.chat.pk,
        )
        self.assertTrue(await other_chat_listener.receive_nothing(timeout=0.1))
        await recipient.disconnect()
        await other_chat_listener.disconnect()

    async def test_access_is_rechecked_before_delivering_an_event(self):
        communicator = self._communicator(self.chat, self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(
            PvMembership.objects.filter(pv=self.chat, user=self.bob).delete
        )()
        await database_sync_to_async(create_text_message)(
            self.alice,
            self.chat,
            "Bob no longer has access",
        )
        response = await communicator.receive_output()

        self.assertEqual(response["type"], "websocket.close")
        self.assertEqual(response["code"], 4403)
        await communicator.disconnect()

    async def test_client_payloads_are_ignored_without_breaking_live_events(self):
        communicator = self._communicator(self.chat, self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_to(text_data="not a supported client event")
        self.assertTrue(await communicator.receive_nothing(timeout=0.1))

        message = await database_sync_to_async(create_text_message)(
            self.alice,
            self.chat,
            "Server event still works",
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["message"]["id"], message.pk)
        await communicator.disconnect()

    async def test_rolled_back_message_emits_no_event(self):
        communicator = self._communicator(self.chat, self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        persisted = await database_sync_to_async(self._roll_back_message)()

        self.assertFalse(persisted)
        self.assertTrue(await communicator.receive_nothing(timeout=0.1))
        await communicator.disconnect()

    def _serialize_message(self, message_id):
        message = NormalMessage.objects.select_related(
            "sender", "sender__tag", "file"
        ).get(pk=message_id)
        return NormalMessageSerializer(message).data

    def _roll_back_message(self):
        content = "This transaction will roll back"
        try:
            with transaction.atomic():
                create_text_message(self.alice, self.chat, content)
                raise RuntimeError("force rollback")
        except RuntimeError:
            pass
        return NormalMessage.objects.filter(content=content).exists()
