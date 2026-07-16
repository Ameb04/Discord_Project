from django.test import TestCase

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
