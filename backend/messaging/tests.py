from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
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
from core.models import File

from .models import Message, NormalMessage
from .services import create_media_message, create_text_message


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


class MediaMessageUploadApiTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.private_root = Path(self.temp_dir.name) / "private"
        self.public_root = Path(self.temp_dir.name) / "media"
        self.settings_override = override_settings(
            PRIVATE_MEDIA_ROOT=self.private_root,
            MEDIA_ROOT=self.public_root,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.temp_dir.cleanup)

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

    def media_url(self, chat):
        return f"/api/chats/{chat.pk}/messages/media/"

    def create_pv(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)
        PvMembership.objects.create(pv=pv, user=self.member)
        return pv

    def create_group(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)
        return group

    def test_authorized_pv_member_can_upload_media(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.member)

        response = client.post(
            self.media_url(pv),
            {
                "file": self.upload("report.pdf", b"pdf bytes", "application/pdf"),
                "content": "Quarterly report",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["chat"], pv.pk)
        self.assertEqual(response.data["sender"]["phone_number"], self.member.pk)
        self.assertEqual(response.data["content"], "Quarterly report")
        self.assertEqual(response.data["attachment"]["name"], "report.pdf")
        self.assertEqual(response.data["attachment"]["type"], "application/pdf")
        self.assertEqual(response.data["attachment"]["size"], 9)
        self.assert_private_file_exists(File.objects.get())

    def test_unauthorized_pv_user_cannot_upload(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.third_user)

        response = client.post(
            self.media_url(pv),
            {"file": self.upload("secret.txt", b"secret", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 403)
        self.assert_no_messages_files_or_private_uploads()

    def test_authorized_group_owner_and_member_can_upload(self):
        group = self.create_group()

        owner_response = self.authenticated_client(self.owner).post(
            self.media_url(group),
            {"file": self.upload("owner.txt", b"owner", "text/plain")},
            format="multipart",
        )
        member_response = self.authenticated_client(self.member).post(
            self.media_url(group),
            {"file": self.upload("member.txt", b"member", "text/plain")},
            format="multipart",
        )

        self.assertEqual(owner_response.status_code, 201)
        self.assertEqual(member_response.status_code, 201)
        self.assertEqual(NormalMessage.objects.count(), 2)
        self.assertEqual(File.objects.count(), 2)

    def test_unauthorized_group_user_cannot_upload(self):
        group = self.create_group()
        client = self.authenticated_client(self.third_user)

        response = client.post(
            self.media_url(group),
            {"file": self.upload("nope.txt", b"nope", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 403)
        self.assert_no_messages_files_or_private_uploads()

    def test_missing_file_is_rejected(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.media_url(pv),
            {"content": "missing file"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assert_no_messages_files_or_private_uploads()

    def test_empty_file_is_rejected(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.media_url(pv),
            {"file": self.upload("empty.txt", b"", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assert_no_messages_files_or_private_uploads()

    def test_nonexistent_chat_returns_404(self):
        client = self.authenticated_client(self.owner)

        response = client.post(
            "/api/chats/9999/messages/media/",
            {"file": self.upload("file.txt", b"hello", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 404)

    def test_unauthenticated_request_is_rejected(self):
        pv = self.create_pv()

        response = APIClient().post(
            self.media_url(pv),
            {"file": self.upload("file.txt", b"hello", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 403)
        self.assert_no_messages_files_or_private_uploads()

    def test_successful_upload_creates_one_message_and_one_file(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.media_url(pv),
            {"file": self.upload("image.png", b"image", "image/png")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(NormalMessage.objects.count(), 1)
        self.assertEqual(File.objects.count(), 1)
        self.assertEqual(NormalMessage.objects.get().file, File.objects.get())

    def test_response_does_not_expose_private_storage_path(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.owner)

        response = client.post(
            self.media_url(pv),
            {"file": self.upload("secret.txt", b"secret", "text/plain")},
            format="multipart",
        )
        response_text = str(response.data)

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("storage_path", response.data["attachment"])
        self.assertNotIn("attachments/chat_", response_text)
        self.assertNotIn(str(settings.PRIVATE_MEDIA_ROOT), response_text)
        self.assertNotIn(str(settings.MEDIA_ROOT), response_text)

    def test_failed_request_leaves_no_message_file_or_private_upload(self):
        pv = self.create_pv()
        client = self.authenticated_client(self.third_user)

        response = client.post(
            self.media_url(pv),
            {"file": self.upload("blocked.txt", b"blocked", "text/plain")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 403)
        self.assert_no_messages_files_or_private_uploads()

    def upload(self, name, content, content_type):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def private_path(self, stored_file):
        return (Path(settings.PRIVATE_MEDIA_ROOT) / stored_file.storage_path).resolve()

    def assert_private_file_exists(self, stored_file):
        self.assertTrue(self.private_path(stored_file).exists())

    def assert_no_messages_files_or_private_uploads(self):
        self.assertEqual(Message.objects.count(), 0)
        self.assertEqual(NormalMessage.objects.count(), 0)
        self.assertEqual(File.objects.count(), 0)
        if self.private_root.exists():
            stored_paths = [path for path in self.private_root.rglob("*") if path.is_file()]
            self.assertEqual(stored_paths, [])


class AttachmentDownloadApiTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.private_root = Path(self.temp_dir.name) / "private"
        self.public_root = Path(self.temp_dir.name) / "media"
        self.settings_override = override_settings(
            PRIVATE_MEDIA_ROOT=self.private_root,
            MEDIA_ROOT=self.public_root,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.temp_dir.cleanup)

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

    def attachment_url(self, message):
        return f"/api/messages/{message.pk}/attachment/"

    def create_pv(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)
        PvMembership.objects.create(pv=pv, user=self.member)
        return pv

    def create_group(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)
        return group

    def create_media(self, chat, sender=None, content=b"file bytes", name="file.txt"):
        return create_media_message(
            sender or self.owner,
            chat,
            self.upload(name, content, "text/plain"),
        )

    def test_authorized_pv_member_can_download_attachment(self):
        pv = self.create_pv()
        message = self.create_media(pv, content=b"private bytes", name="private.txt")
        client = self.authenticated_client(self.member)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.response_bytes(response), b"private bytes")

    def test_unauthorized_pv_third_user_cannot_download_attachment(self):
        pv = self.create_pv()
        message = self.create_media(pv, content=b"private bytes")
        client = self.authenticated_client(self.third_user)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 403)
        self.assertFalse(hasattr(response, "streaming_content"))

    def test_authorized_group_owner_and_member_can_download_attachment(self):
        group = self.create_group()
        message = self.create_media(group, content=b"group bytes", name="group.txt")

        owner_response = self.authenticated_client(self.owner).get(
            self.attachment_url(message)
        )
        member_response = self.authenticated_client(self.member).get(
            self.attachment_url(message)
        )

        self.assertEqual(owner_response.status_code, 200)
        self.assertEqual(member_response.status_code, 200)
        self.assertEqual(self.response_bytes(owner_response), b"group bytes")
        self.assertEqual(self.response_bytes(member_response), b"group bytes")

    def test_unauthorized_group_user_cannot_download_attachment(self):
        group = self.create_group()
        message = self.create_media(group, content=b"group bytes")
        client = self.authenticated_client(self.third_user)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 403)
        self.assertFalse(hasattr(response, "streaming_content"))

    def test_unauthenticated_request_is_rejected(self):
        pv = self.create_pv()
        message = self.create_media(pv)

        response = APIClient().get(self.attachment_url(message))

        self.assertEqual(response.status_code, 403)

    def test_nonexistent_message_returns_404(self):
        client = self.authenticated_client(self.owner)

        response = client.get("/api/messages/9999/attachment/")

        self.assertEqual(response.status_code, 404)

    def test_message_without_attachment_returns_404(self):
        pv = self.create_pv()
        message = create_text_message(self.owner, pv, "Text only")
        client = self.authenticated_client(self.owner)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 404)

    def test_missing_physical_file_returns_404(self):
        pv = self.create_pv()
        message = self.create_media(pv)
        self.private_path(message.file).unlink()
        client = self.authenticated_client(self.owner)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 404)

    def test_successful_response_uses_attachment_content_disposition(self):
        pv = self.create_pv()
        message = self.create_media(pv, name="download.txt")
        client = self.authenticated_client(self.owner)

        response = client.get(self.attachment_url(message))

        self.assertEqual(response.status_code, 200)
        content_disposition = response["Content-Disposition"]
        self.assertIn("attachment", content_disposition)
        self.assertIn("download.txt", content_disposition)

    def test_serializer_does_not_expose_storage_path_and_has_download_url(self):
        pv = self.create_pv()
        message = self.create_media(pv)
        client = self.authenticated_client(self.owner)

        response = client.get(f"/api/chats/{pv.pk}/messages/")
        attachment = response.data[0]["attachment"]
        response_text = str(response.data)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            attachment["download_url"],
            f"/api/messages/{message.pk}/attachment/",
        )
        self.assertNotIn("storage_path", attachment)
        self.assertNotIn("attachments/chat_", response_text)
        self.assertNotIn(str(settings.PRIVATE_MEDIA_ROOT), response_text)
        self.assertNotIn(str(settings.MEDIA_ROOT), response_text)

    def upload(self, name, content, content_type):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def private_path(self, stored_file):
        return (Path(settings.PRIVATE_MEDIA_ROOT) / stored_file.storage_path).resolve()

    def response_bytes(self, response):
        return b"".join(response.streaming_content)


class MediaMessageCreationServiceTests(TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.private_root = Path(self.temp_dir.name) / "private"
        self.public_root = Path(self.temp_dir.name) / "media"
        self.settings_override = override_settings(
            PRIVATE_MEDIA_ROOT=self.private_root,
            MEDIA_ROOT=self.public_root,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.temp_dir.cleanup)

        self.owner = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.member = User.objects.create_user(
            phone_number="2000", password="password"
        )
        self.third_user = User.objects.create_user(
            phone_number="3000", password="password"
        )

    def test_authorized_pv_member_can_create_media_message(self):
        pv = self.create_authorized_pv()

        message = create_media_message(
            self.owner,
            pv,
            self.upload("report.pdf", b"private pdf", "application/pdf"),
            content="  See attached  ",
        )

        self.assertIsInstance(message, NormalMessage)
        self.assertEqual(message.sender, self.owner)
        self.assertEqual(message.chat, pv)
        self.assertEqual(message.content, "See attached")
        self.assertIsNotNone(message.sent_at)
        self.assertIsNotNone(message.file)
        self.assert_private_file_exists(message.file)

    def test_unauthorized_pv_user_cannot_upload(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)

        with self.assertRaises(PermissionDenied):
            create_media_message(
                self.third_user,
                pv,
                self.upload("secret.txt", b"secret", "text/plain"),
            )

        self.assert_no_messages_files_or_private_uploads()

    def test_authorized_group_owner_and_member_can_upload(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)
        GroupMembership.objects.create(group=group, user=self.member)

        owner_message = create_media_message(
            self.owner, group, self.upload("owner.txt", b"owner", "text/plain")
        )
        member_message = create_media_message(
            self.member, group, self.upload("member.txt", b"member", "text/plain")
        )

        self.assertEqual(owner_message.sender, self.owner)
        self.assertEqual(member_message.sender, self.member)
        self.assertEqual(NormalMessage.objects.count(), 2)
        self.assertEqual(File.objects.count(), 2)

    def test_unauthorized_group_user_cannot_upload(self):
        group = Group.objects.create(name="Group chat", owner=self.owner)

        with self.assertRaises(PermissionDenied):
            create_media_message(
                self.third_user,
                group,
                self.upload("nope.txt", b"nope", "text/plain"),
            )

        self.assert_no_messages_files_or_private_uploads()

    def test_authorized_topic_user_can_upload(self):
        channel = Channel.objects.create(name="Public channel", owner=self.owner)
        topic = Topic.objects.create(
            name="Public topic",
            channel=channel,
            access_level=AccessLevel.PUBLIC,
        )

        message = create_media_message(
            self.third_user,
            topic,
            self.upload("topic.txt", b"topic", "text/plain"),
        )

        self.assertEqual(message.chat, topic)
        self.assertEqual(message.sender, self.third_user)
        self.assert_private_file_exists(message.file)

    def test_missing_file_is_rejected(self):
        pv = self.create_authorized_pv()

        with self.assertRaises(ValidationError):
            create_media_message(self.owner, pv, None)

        self.assert_no_messages_files_or_private_uploads()

    def test_empty_file_is_rejected(self):
        pv = self.create_authorized_pv()

        with self.assertRaises(ValidationError):
            create_media_message(
                self.owner,
                pv,
                self.upload("empty.txt", b"", "text/plain"),
            )

        self.assert_no_messages_files_or_private_uploads()

    def test_file_is_stored_under_private_media_root_not_public_media_root(self):
        pv = self.create_authorized_pv()

        message = create_media_message(
            self.owner,
            pv,
            self.upload("photo.png", b"png bytes", "image/png"),
        )

        private_path = self.private_path(message.file)
        public_root = Path(settings.MEDIA_ROOT).resolve()
        self.assertTrue(private_path.exists())
        self.assertIn(Path(settings.PRIVATE_MEDIA_ROOT).resolve(), private_path.parents)
        self.assertNotEqual(public_root, private_path)
        self.assertNotIn(public_root, private_path.parents)

    def test_core_file_stores_private_metadata(self):
        pv = self.create_authorized_pv()

        message = create_media_message(
            self.owner,
            pv,
            self.upload("folder\\unsafe name.txt", b"hello", "text/plain"),
        )
        stored_file = message.file

        self.assertEqual(stored_file.name, "unsafe_name.txt")
        self.assertEqual(stored_file.type, "text/plain")
        self.assertEqual(stored_file.size, 5)
        self.assertTrue(stored_file.storage_path.startswith(f"attachments/chat_{pv.pk}/"))
        self.assertEqual(stored_file.link, "")

    def test_created_message_references_the_correct_file(self):
        pv = self.create_authorized_pv()

        message = create_media_message(
            self.owner,
            pv,
            self.upload("notes.txt", b"notes", "text/plain"),
        )

        self.assertEqual(message.file, File.objects.get(pk=message.file_id))

    def test_failed_database_creation_removes_orphaned_private_file(self):
        pv = self.create_authorized_pv()

        with mock.patch(
            "messaging.services.File.objects.create",
            side_effect=RuntimeError("database failed"),
        ):
            with self.assertRaises(RuntimeError):
                create_media_message(
                    self.owner,
                    pv,
                    self.upload("orphan.txt", b"orphan", "text/plain"),
                )

        self.assert_no_messages_files_or_private_uploads()

    def test_repeated_filenames_do_not_overwrite_each_other(self):
        pv = self.create_authorized_pv()

        first = create_media_message(
            self.owner, pv, self.upload("same.txt", b"first", "text/plain")
        )
        second = create_media_message(
            self.owner, pv, self.upload("same.txt", b"second", "text/plain")
        )

        self.assertEqual(first.file.name, "same.txt")
        self.assertEqual(second.file.name, "same.txt")
        self.assertNotEqual(first.file.storage_path, second.file.storage_path)
        self.assertEqual(self.private_path(first.file).read_bytes(), b"first")
        self.assertEqual(self.private_path(second.file).read_bytes(), b"second")

    def upload(self, name, content, content_type):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def create_authorized_pv(self):
        pv = Pv.objects.create(name="Direct chat")
        PvMembership.objects.create(pv=pv, user=self.owner)
        PvMembership.objects.create(pv=pv, user=self.member)
        return pv

    def private_path(self, stored_file):
        return (Path(settings.PRIVATE_MEDIA_ROOT) / stored_file.storage_path).resolve()

    def assert_private_file_exists(self, stored_file):
        self.assertTrue(self.private_path(stored_file).exists())

    def assert_no_messages_files_or_private_uploads(self):
        self.assertEqual(Message.objects.count(), 0)
        self.assertEqual(NormalMessage.objects.count(), 0)
        self.assertEqual(File.objects.count(), 0)
        if self.private_root.exists():
            stored_paths = [path for path in self.private_root.rglob("*") if path.is_file()]
            self.assertEqual(stored_paths, [])
