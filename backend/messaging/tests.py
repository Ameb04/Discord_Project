from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
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


class MessageListCreateApiTests(TestCase):
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

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client

    def messages_url(self, chat):
        return f"/api/chats/{chat.pk}/messages/"

    def create_pv(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)
        PvMembership.objects.create(pv=pv, user=self.member)
        return pv

    def create_group(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)
        return group

    def test_authorized_pv_member_can_list_messages(self):
        pv = self.create_pv()
        create_text_message(self.owner, pv, "Private hello")
        client = self.authenticated_client(self.member)

        response = client.get(self.messages_url(pv))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["content"], "Private hello")
        self.assertEqual(response.data[0]["attachment"], None)

    def test_unauthorized_third_user_cannot_list_pv_messages(self):
        pv = self.create_pv()
        create_text_message(self.owner, pv, "Private secret")
        client = self.authenticated_client(self.third_user)

        response = client.get(self.messages_url(pv))

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("Private secret", str(response.data))

    def test_authorized_group_owner_and_member_can_list_messages(self):
        group = self.create_group()
        create_text_message(self.owner, group, "Group hello")

        owner_response = self.authenticated_client(self.owner).get(
            self.messages_url(group)
        )
        member_response = self.authenticated_client(self.member).get(
            self.messages_url(group)
        )

        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(member_response.status_code, 200)
        self.assertEqual(owner_response.data[0]["content"], "Group hello")
        self.assertEqual(member_response.data[0]["content"], "Group hello")

    def test_unauthorized_group_user_cannot_list_messages(self):
        group = self.create_group()
        create_text_message(self.owner, group, "Group secret")
        client = self.authenticated_client(self.third_user)

        response = client.get(self.messages_url(group))

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("Group secret", str(response.data))

    def test_authorized_user_can_post_valid_text_message(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.messages_url(pv), {"content": "Hello"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["chat"], pv.pk)
        self.assertEqual(response.data["sender"]["phone_number"], self.owner.pk)
        self.assertEqual(response.data["content"], "Hello")
        self.assertIsNotNone(response.data["sent_at"])
        self.assertEqual(response.data["attachment"], None)

    def test_empty_content_is_rejected(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(self.messages_url(pv), {"content": ""}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(NormalMessage.objects.count(), 0)

    def test_whitespace_only_content_is_rejected(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.messages_url(pv), {"content": "   \n\t  "}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(NormalMessage.objects.count(), 0)

    def test_unauthorized_sender_is_rejected(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.third_user)

        response = client.post(
            self.messages_url(pv), {"content": "Nope"}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(NormalMessage.objects.count(), 0)

    def test_nonexistent_chat_returns_404(self):
        client = self.authenticated_client(self.owner)

        get_response = client.get("/api/chats/9999/messages/")
        post_response = client.post(
            "/api/chats/9999/messages/", {"content": "Hello"}, format="json"
        )

        self.assertEqual(get_response.status_code, 404)
        self.assertEqual(post_response.status_code, 404)

    def test_unauthenticated_get_is_rejected(self):
        pv = self.create_pv()

        response = APIClient().get(self.messages_url(pv))

        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_post_is_rejected(self):
        pv = self.create_pv()

        response = APIClient().post(
            self.messages_url(pv), {"content": "Hello"}, format="json"
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(NormalMessage.objects.count(), 0)

    def test_sent_message_appears_in_subsequent_get(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        post_response = client.post(
            self.messages_url(pv), {"content": "Fresh message"}, format="json"
        )
        get_response = client.get(self.messages_url(pv))

        self.assertEqual(post_response.status_code, 201)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data[0]["id"], post_response.data["id"])
        self.assertEqual(get_response.data[0]["content"], "Fresh message")

    def test_messages_are_returned_in_chronological_order(self):
        pv = self.create_pv()
        create_text_message(self.owner, pv, "First")
        create_text_message(self.member, pv, "Second")
        client = self.authenticated_client(self.owner)

        response = client.get(self.messages_url(pv))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [message["content"] for message in response.data],
            ["First", "Second"],
        )
