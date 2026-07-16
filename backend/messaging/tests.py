from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase

from accounts.models import User
from chats.models import (
    AccessLevel,
    Channel,
    Group,
    GroupMembership,
    Pv,
    PvMembership,
    Topic,
)

from .models import Message, NormalMessage
from .services import create_text_message


class TextMessageCreationServiceTests(TestCase):
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

    def test_authorized_pv_member_can_send_text_message(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)

        message = create_text_message(self.owner, pv, "Hello")

        self.assertIsInstance(message, NormalMessage)
        self.assertEqual(NormalMessage.objects.count(), 1)

    def test_unauthorized_pv_user_cannot_send_text_message(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)

        with self.assertRaises(PermissionDenied):
            create_text_message(self.third_user, pv, "Hello")

        self.assert_no_messages_created()

    def test_authorized_group_owner_and_member_can_send_text_message(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)

        owner_message = create_text_message(self.owner, group, "Owner message")
        member_message = create_text_message(self.member, group, "Member message")

        self.assertEqual(owner_message.sender, self.owner)
        self.assertEqual(member_message.sender, self.member)
        self.assertEqual(NormalMessage.objects.count(), 2)

    def test_unauthorized_group_user_cannot_send_text_message(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)

        with self.assertRaises(PermissionDenied):
            create_text_message(self.third_user, group, "Hello")

        self.assert_no_messages_created()

    def test_authorized_topic_user_can_send_text_message(self):
        channel = Channel.objects.create(name="Public channel", owner=self.owner)
        topic = Topic.objects.create(
            name="Public topic",
            channel=channel,
            access_level=AccessLevel.PUBLIC,
        )

        message = create_text_message(self.third_user, topic, "Topic message")

        self.assertEqual(message.chat, topic)
        self.assertEqual(message.sender, self.third_user)

    def test_empty_string_is_rejected(self):
        pv = self.create_authorized_pv()

        with self.assertRaises(ValidationError):
            create_text_message(self.owner, pv, "")

        self.assert_no_messages_created()

    def test_whitespace_only_string_is_rejected(self):
        pv = self.create_authorized_pv()

        with self.assertRaises(ValidationError):
            create_text_message(self.owner, pv, "   \n\t  ")

        self.assert_no_messages_created()

    def test_valid_message_stores_sender_chat_content_and_timestamp(self):
        pv = self.create_authorized_pv()

        message = create_text_message(self.owner, pv, "  Hello there  ")

        self.assertEqual(message.sender, self.owner)
        self.assertEqual(message.chat, pv)
        self.assertEqual(message.content, "Hello there")
        self.assertIsNotNone(message.sent_at)
        self.assertIsNone(message.file)

    def test_failed_validation_creates_no_message(self):
        pv = self.create_authorized_pv()

        with self.assertRaises(ValidationError):
            create_text_message(self.owner, pv, None)

        self.assert_no_messages_created()

    def test_inactive_sender_is_rejected_before_creating_message(self):
        pv = self.create_authorized_pv()
        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])

        with self.assertRaises(PermissionDenied):
            create_text_message(self.owner, pv, "Hello")

        self.assert_no_messages_created()

    def create_authorized_pv(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)
        return pv

    def assert_no_messages_created(self):
        self.assertEqual(Message.objects.count(), 0)
        self.assertEqual(NormalMessage.objects.count(), 0)
