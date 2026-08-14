from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.sessions.backends.db import SessionStore
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import User
from chats.models import (
    Channel,
    ChannelMembership,
    Group,
    GroupMembership,
    Pv,
    PvMembership,
    Topic,
)
from config.asgi import application

from .models import ChannelMute, ChatMute
from .notifications import user_notification_group_name
from .services import create_text_message


class NotificationGroupNameTests(TestCase):
    """The channel-layer name derived from a user id must always be legal.

    Group names admit only ``[a-zA-Z0-9._-]``. Phone numbers are the user's
    primary key and routinely start with ``+``, which is not in that set — and
    the resulting ``group_send`` failure is swallowed by the ``on_commit``
    callback it runs in, so nothing about it is visible except notifications
    quietly never arriving.
    """

    def test_group_name_is_legal_for_every_shape_of_phone_number(self):
        for phone_number in ("+989120001000", "09121111111", "+1 (555) 010", "۰۹۱۲"):
            with self.subTest(phone_number=phone_number):
                self.assertRegex(
                    user_notification_group_name(phone_number),
                    r"^[a-zA-Z\d\-_.]+$",
                )

    def test_group_name_is_short_enough_for_the_channel_layer(self):
        self.assertLess(len(user_notification_group_name("+" * 200)), 100)

    def test_similar_phone_numbers_do_not_share_a_group(self):
        """The near-misses a naive "strip the plus" would collide."""
        names = {
            user_notification_group_name(phone_number)
            for phone_number in ("+989120001000", "989120001000", "0989120001000")
        }
        self.assertEqual(len(names), 3)

    def test_the_same_user_always_resolves_to_the_same_group(self):
        self.assertEqual(
            user_notification_group_name("+989120001000"),
            user_notification_group_name("+989120001000"),
        )


TEST_CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}


class ConversationFixtureMixin:
    """One of every kind of room, with the same three people in each.

    The phone numbers carry a leading ``+`` on purpose. They are the primary
    key, and anything that derives an identifier from them — a channel-layer
    group name, say — has to cope with a character that plain digits would
    never have exposed.
    """

    def build_conversations(self):
        self.alice = User.objects.create_user(
            phone_number="+989120001000", password="password", first_name="Alice"
        )
        self.bob = User.objects.create_user(
            phone_number="+989120002000", password="password", first_name="Bob"
        )
        self.outsider = User.objects.create_user(
            phone_number="+989120003000", password="password"
        )

        self.direct_chat = Pv.objects.create(name="Alice and Bob")
        PvMembership.objects.create(pv=self.direct_chat, user=self.alice)
        PvMembership.objects.create(pv=self.direct_chat, user=self.bob)

        self.group = Group.objects.create(name="Study group", owner=self.alice)
        GroupMembership.objects.create(group=self.group, user=self.alice)
        GroupMembership.objects.create(group=self.group, user=self.bob)

        self.channel = Channel.objects.create(name="Announcements", owner=self.alice)
        ChannelMembership.objects.create(channel=self.channel, user=self.alice)
        ChannelMembership.objects.create(channel=self.channel, user=self.bob)
        self.topic = Topic.objects.create(name="general", channel=self.channel)


@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class NotificationWebSocketTests(ConversationFixtureMixin, TransactionTestCase):
    def setUp(self):
        self.build_conversations()
        # Built here rather than inside the tests: creating a session hits the
        # database, which an async test body cannot do directly.
        self.bob_headers = self._session_headers(self.bob)
        self.alice_headers = self._session_headers(self.alice)
        self.outsider_headers = self._session_headers(self.outsider)

    def _session_headers(self, user):
        session = SessionStore()
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        cookie = f"{settings.SESSION_COOKIE_NAME}={session.session_key}"
        return [(b"cookie", cookie.encode("ascii"))]

    def _communicator(self, headers=None):
        return WebsocketCommunicator(
            application,
            "/ws/notifications/",
            headers=headers,
        )

    async def test_unauthenticated_user_cannot_connect(self):
        communicator = self._communicator()

        connected, close_code = await communicator.connect()

        self.assertFalse(connected)
        self.assertEqual(close_code, 4401)

    async def test_member_is_notified_about_a_direct_message(self):
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        message = await database_sync_to_async(create_text_message)(
            self.alice, self.direct_chat, "Are you there?"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["type"], "notification.message")
        self.assertEqual(event["chat"], self.direct_chat.pk)
        self.assertEqual(event["message_id"], message.pk)
        self.assertEqual(event["preview"], "Are you there?")
        self.assertEqual(event["sender"]["phone_number"], self.alice.phone_number)
        # A direct chat has no name of its own, so it is named for the sender.
        self.assertEqual(event["conversation"]["type"], "direct")
        self.assertEqual(event["conversation"]["title"], "Alice")
        await communicator.disconnect()

    async def test_group_notification_carries_the_group_name(self):
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Meeting at six"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["conversation"]["type"], "group")
        self.assertEqual(event["conversation"]["title"], "Study group")
        await communicator.disconnect()

    async def test_topic_notification_carries_its_channel(self):
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.topic, "Read this"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["conversation"]["type"], "topic")
        self.assertEqual(event["conversation"]["title"], "general")
        self.assertEqual(event["conversation"]["channel"], "Announcements")
        await communicator.disconnect()

    async def test_sender_is_not_notified_about_their_own_message(self):
        communicator = self._communicator(self.alice_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Talking to myself"
        )

        self.assertTrue(await communicator.receive_nothing(timeout=0.2))
        await communicator.disconnect()

    async def test_an_unmuted_chat_is_marked_as_showable(self):
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Loud and clear"
        )
        event = await communicator.receive_json_from()

        self.assertTrue(event["notify"])
        await communicator.disconnect()

    async def test_a_muted_chat_still_arrives_but_may_not_be_shown(self):
        """Muting silences the interruption, not the fact of the message.

        The event still has to land, because the recipient's unread badge has
        to move — a muted room whose count never changed would look like a room
        nobody had written in.
        """
        await database_sync_to_async(ChatMute.objects.create)(
            chat=self.group, user=self.bob
        )
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Silenced"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["chat"], self.group.pk)
        self.assertFalse(event["notify"])
        await communicator.disconnect()

    async def test_muting_a_channel_silences_its_topics(self):
        await database_sync_to_async(ChannelMute.objects.create)(
            channel=self.channel, user=self.bob
        )
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.topic, "Nobody is interrupted by this"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["chat"], self.topic.pk)
        self.assertFalse(event["notify"])
        await communicator.disconnect()

    async def test_muting_one_chat_leaves_the_others_loud(self):
        await database_sync_to_async(ChatMute.objects.create)(
            chat=self.group, user=self.bob
        )
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Silenced"
        )
        await database_sync_to_async(create_text_message)(
            self.alice, self.direct_chat, "Still audible"
        )
        notify_by_chat = {
            event["chat"]: event["notify"]
            for event in [
                await communicator.receive_json_from(),
                await communicator.receive_json_from(),
            ]
        }

        self.assertFalse(notify_by_chat[self.group.pk])
        self.assertTrue(notify_by_chat[self.direct_chat.pk])
        await communicator.disconnect()

    async def test_non_member_is_not_notified(self):
        outsider_communicator = self._communicator(self.outsider_headers)
        connected, _ = await outsider_communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "Members only"
        )

        self.assertTrue(await outsider_communicator.receive_nothing(timeout=0.2))
        await outsider_communicator.disconnect()

    async def test_notification_arrives_without_the_chat_socket_being_open(self):
        """The whole point: told about a room you are not currently in."""
        communicator = self._communicator(self.bob_headers)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await database_sync_to_async(create_text_message)(
            self.alice, self.group, "While you were away"
        )
        event = await communicator.receive_json_from()

        self.assertEqual(event["chat"], self.group.pk)
        await communicator.disconnect()


class MuteApiTests(ConversationFixtureMixin, TestCase):
    def setUp(self):
        self.build_conversations()

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def test_member_can_mute_and_unmute_a_chat(self):
        client = self.authenticated_client(self.bob)

        response = client.put(f"/api/chats/{self.group.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_muted"])
        self.assertTrue(
            ChatMute.objects.filter(chat=self.group, user=self.bob).exists()
        )

        response = client.delete(f"/api/chats/{self.group.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_muted"])
        self.assertFalse(
            ChatMute.objects.filter(chat=self.group, user=self.bob).exists()
        )

    def test_muting_twice_is_harmless(self):
        client = self.authenticated_client(self.bob)

        client.put(f"/api/chats/{self.group.pk}/mute/")
        response = client.put(f"/api/chats/{self.group.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            ChatMute.objects.filter(chat=self.group, user=self.bob).count(), 1
        )

    def test_unmuting_something_never_muted_is_harmless(self):
        client = self.authenticated_client(self.bob)

        response = client.delete(f"/api/chats/{self.direct_chat.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_muted"])

    def test_non_member_cannot_mute_a_chat(self):
        client = self.authenticated_client(self.outsider)

        response = client.put(f"/api/chats/{self.group.pk}/mute/")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ChatMute.objects.filter(chat=self.group).exists())

    def test_member_can_mute_and_unmute_a_channel(self):
        client = self.authenticated_client(self.bob)

        response = client.put(f"/api/channels/{self.channel.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            ChannelMute.objects.filter(channel=self.channel, user=self.bob).exists()
        )

        response = client.delete(f"/api/channels/{self.channel.pk}/mute/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            ChannelMute.objects.filter(channel=self.channel, user=self.bob).exists()
        )

    def test_non_member_cannot_mute_a_channel(self):
        client = self.authenticated_client(self.outsider)

        response = client.put(f"/api/channels/{self.channel.pk}/mute/")

        self.assertEqual(response.status_code, 403)

    def test_mute_is_per_person(self):
        self.authenticated_client(self.bob).put(f"/api/chats/{self.group.pk}/mute/")

        index = self.authenticated_client(self.alice).get("/api/chats/").data
        alice_group = next(
            group for group in index["groups"] if group["id"] == self.group.pk
        )

        self.assertFalse(alice_group["is_muted"])

    def test_conversation_index_reports_mute_state(self):
        client = self.authenticated_client(self.bob)
        client.put(f"/api/chats/{self.group.pk}/mute/")
        client.put(f"/api/chats/{self.direct_chat.pk}/mute/")
        client.put(f"/api/channels/{self.channel.pk}/mute/")

        index = client.get("/api/chats/").data

        self.assertTrue(index["groups"][0]["is_muted"])
        self.assertTrue(index["private_chats"][0]["is_muted"])
        self.assertTrue(index["channels"][0]["is_muted"])
        # A channel-wide mute is the channel's own flag; the topic keeps
        # reporting whether it was silenced individually.
        self.assertFalse(index["channels"][0]["topics"][0]["is_muted"])

    def test_topic_can_be_muted_on_its_own(self):
        client = self.authenticated_client(self.bob)

        client.put(f"/api/chats/{self.topic.pk}/mute/")
        index = client.get("/api/chats/").data

        self.assertTrue(index["channels"][0]["topics"][0]["is_muted"])
        self.assertFalse(index["channels"][0]["is_muted"])
