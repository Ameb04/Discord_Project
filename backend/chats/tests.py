from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import User

from .models import (
    AccessLevel,
    Channel,
    ChannelMembership,
    Group,
    GroupMembership,
    Pv,
    PvMembership,
    Topic,
)
from .permissions import can_access_chat, can_send_to_chat
from .services import build_direct_chat_key, get_or_create_direct_chat


class ChatPermissionTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.member = User.objects.create_user(
            phone_number="2000", password="password"
        )
        self.third_user = User.objects.create_user(
            phone_number="3000", password="password"
        )

    def assert_can_access_and_send(self, user, chat):
        self.assertTrue(can_access_chat(user, chat))
        self.assertTrue(can_send_to_chat(user, chat))

    def assert_cannot_access_or_send(self, user, chat):
        self.assertFalse(can_access_chat(user, chat))
        self.assertFalse(can_send_to_chat(user, chat))

    def test_pv_member_can_access_and_send(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)

        self.assert_can_access_and_send(self.owner, pv)

    def test_pv_rejects_user_without_membership(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)

        self.assert_cannot_access_or_send(self.third_user, pv)

    def test_group_owner_and_member_can_access_and_send(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)

        self.assert_can_access_and_send(self.owner, group)
        self.assert_can_access_and_send(self.member, group)

    def test_group_rejects_user_without_membership(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)

        self.assert_cannot_access_or_send(self.third_user, group)

    def test_public_topic_in_public_channel_allows_authenticated_user(self):
        channel = Channel.objects.create(name="Public channel", owner=self.owner)
        topic = Topic.objects.create(
            name="Public topic",
            channel=channel,
            access_level=AccessLevel.PUBLIC,
        )

        self.assert_can_access_and_send(self.third_user, topic)

    def test_private_topic_requires_channel_owner_or_member(self):
        channel = Channel.objects.create(name="Public channel", owner=self.owner)
        topic = Topic.objects.create(
            name="Private topic",
            channel=channel,
            access_level=AccessLevel.PRIVATE,
        )
        ChannelMembership.objects.create(channel=channel, user=self.member)

        self.assert_can_access_and_send(self.owner, topic)
        self.assert_can_access_and_send(self.member, topic)
        self.assert_cannot_access_or_send(self.third_user, topic)

    def test_private_channel_topic_requires_channel_owner_or_member(self):
        channel = Channel.objects.create(
            name="Private channel", owner=self.owner, is_private=True
        )
        topic = Topic.objects.create(
            name="Channel topic",
            channel=channel,
            access_level=AccessLevel.PUBLIC,
        )
        ChannelMembership.objects.create(channel=channel, user=self.member)

        self.assert_can_access_and_send(self.owner, topic)
        self.assert_can_access_and_send(self.member, topic)
        self.assert_cannot_access_or_send(self.third_user, topic)

    def test_deleted_chat_and_deleted_channel_are_rejected(self):
        group = Group.objects.create(
            name="Deleted group", owner=self.owner, is_deleted=True
        )
        channel = Channel.objects.create(
            name="Deleted channel", owner=self.owner, is_deleted=True
        )
        topic = Topic.objects.create(name="Topic", channel=channel)

        self.assert_cannot_access_or_send(self.owner, group)
        self.assert_cannot_access_or_send(self.owner, topic)


class PvDirectKeyTests(TestCase):
    def test_direct_key_field_is_nullable_and_unique(self):
        field = Pv._meta.get_field("direct_key")

        self.assertTrue(field.null)
        self.assertTrue(field.blank)
        self.assertTrue(field.unique)
        self.assertEqual(field.max_length, 255)

    def test_direct_key_must_be_unique_when_set(self):
        Pv.objects.create(name="First direct chat", direct_key="1000:2000")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Pv.objects.create(name="Duplicate direct chat", direct_key="1000:2000")

    def test_multiple_existing_pvs_can_have_no_direct_key(self):
        first = Pv.objects.create(name="Legacy direct chat")
        second = Pv.objects.create(name="Another legacy direct chat")

        self.assertIsNone(first.direct_key)
        self.assertIsNone(second.direct_key)


class DirectChatServiceTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.bob = User.objects.create_user(phone_number="2000", password="password")

    def test_direct_key_uses_sorted_user_identifiers(self):
        self.assertEqual(
            build_direct_chat_key(self.bob, self.alice),
            "direct:1000:2000",
        )

    def test_first_call_creates_pv(self):
        pv, created = get_or_create_direct_chat(self.alice, self.bob)

        self.assertTrue(created)
        self.assertEqual(Pv.objects.count(), 1)
        self.assertEqual(pv.direct_key, "direct:1000:2000")

    def test_second_call_returns_existing_pv(self):
        first_pv, first_created = get_or_create_direct_chat(self.alice, self.bob)
        second_pv, second_created = get_or_create_direct_chat(self.alice, self.bob)

        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(second_pv.pk, first_pv.pk)
        self.assertEqual(Pv.objects.count(), 1)

    def test_reversed_order_returns_same_pv(self):
        first_pv, _ = get_or_create_direct_chat(self.alice, self.bob)
        second_pv, created = get_or_create_direct_chat(self.bob, self.alice)

        self.assertFalse(created)
        self.assertEqual(second_pv.pk, first_pv.pk)
        self.assertEqual(Pv.objects.count(), 1)

    def test_both_users_receive_memberships(self):
        pv, _ = get_or_create_direct_chat(self.alice, self.bob)

        member_ids = list(
            PvMembership.objects.filter(pv=pv)
            .order_by("user_id")
            .values_list("user_id", flat=True)
        )
        self.assertEqual(member_ids, ["1000", "2000"])

    def test_repeated_calls_do_not_duplicate_memberships(self):
        pv, _ = get_or_create_direct_chat(self.alice, self.bob)

        get_or_create_direct_chat(self.alice, self.bob)
        get_or_create_direct_chat(self.bob, self.alice)

        self.assertEqual(PvMembership.objects.filter(pv=pv).count(), 2)

    def test_existing_direct_chat_memberships_are_synchronized(self):
        pv = Pv.objects.create(direct_key="direct:1000:2000")
        third_user = User.objects.create_user(
            phone_number="3000", password="password"
        )
        PvMembership.objects.create(pv=pv, user=third_user)

        existing_pv, created = get_or_create_direct_chat(self.alice, self.bob)

        member_ids = list(
            PvMembership.objects.filter(pv=existing_pv)
            .order_by("user_id")
            .values_list("user_id", flat=True)
        )
        self.assertFalse(created)
        self.assertEqual(existing_pv.pk, pv.pk)
        self.assertEqual(member_ids, ["1000", "2000"])

    def test_self_chat_is_rejected(self):
        with self.assertRaisesMessage(
            ValueError, "Cannot start a direct chat with yourself."
        ):
            get_or_create_direct_chat(self.alice, self.alice)


class DirectChatApiTests(TestCase):
    url = "/api/chats/direct/"

    def setUp(self):
        self.alice = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.bob = User.objects.create_user(phone_number="2000", password="password")

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def test_authenticated_user_creates_direct_chat(self):
        client = self.authenticated_client(self.alice)

        response = client.post(self.url, {"target_user": self.bob.pk}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["type"], "direct")
        self.assertTrue(response.data["created"])
        self.assertEqual(response.data["other_user"]["phone_number"], self.bob.pk)
        self.assertEqual(Pv.objects.count(), 1)

    def test_repeated_request_returns_same_chat(self):
        client = self.authenticated_client(self.alice)

        first_response = client.post(
            self.url, {"target_user": self.bob.pk}, format="json"
        )
        second_response = client.post(
            self.url, {"target_user": self.bob.pk}, format="json"
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.data["id"], first_response.data["id"])
        self.assertFalse(second_response.data["created"])
        self.assertEqual(Pv.objects.count(), 1)

    def test_reversed_user_pair_returns_same_chat(self):
        alice_client = self.authenticated_client(self.alice)
        bob_client = self.authenticated_client(self.bob)

        first_response = alice_client.post(
            self.url, {"target_user": self.bob.pk}, format="json"
        )
        second_response = bob_client.post(
            self.url, {"target_user": self.alice.pk}, format="json"
        )

        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.data["id"], first_response.data["id"])
        self.assertEqual(second_response.data["other_user"]["phone_number"], self.alice.pk)
        self.assertEqual(Pv.objects.count(), 1)

    def test_self_chat_is_rejected(self):
        client = self.authenticated_client(self.alice)

        response = client.post(self.url, {"target_user": self.alice.pk}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("target_user", response.data)

    def test_missing_target_user_is_rejected(self):
        client = self.authenticated_client(self.alice)

        response = client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("target_user", response.data)

    def test_unknown_target_user_returns_404(self):
        client = self.authenticated_client(self.alice)

        response = client.post(self.url, {"target_user": "9999"}, format="json")

        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().post(self.url, {"target_user": self.bob.pk}, format="json")

        self.assertEqual(response.status_code, 403)

    def test_only_one_pv_exists_for_same_user_pair(self):
        alice_client = self.authenticated_client(self.alice)
        bob_client = self.authenticated_client(self.bob)

        alice_client.post(self.url, {"target_user": self.bob.pk}, format="json")
        alice_client.post(self.url, {"target_user": self.bob.pk}, format="json")
        bob_client.post(self.url, {"target_user": self.alice.pk}, format="json")

        self.assertEqual(Pv.objects.count(), 1)
