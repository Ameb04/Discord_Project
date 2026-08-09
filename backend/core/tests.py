from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.authentication import APP_USER_SESSION_KEY
from accounts.models import BIO_MAX_LENGTH, User

from .models import File, Tag, TagScope


class FilePrivateMetadataTests(TestCase):
    def test_private_file_metadata_can_be_stored_without_public_link(self):
        uploaded_file = File.objects.create(
            name="document.pdf",
            type="application/pdf",
            storage_path="attachments/direct/1/document.pdf",
            size=12345,
        )

        self.assertEqual(uploaded_file.link, "")
        self.assertEqual(uploaded_file.storage_path, "attachments/direct/1/document.pdf")
        self.assertEqual(uploaded_file.size, 12345)

    def test_legacy_file_rows_remain_valid_without_private_metadata(self):
        legacy_file = File.objects.create(
            name="legacy.png",
            type="image/png",
            link="https://example.com/legacy.png",
        )

        self.assertEqual(legacy_file.storage_path, "")
        self.assertIsNone(legacy_file.size)
        self.assertEqual(legacy_file.link, "https://example.com/legacy.png")

    def test_file_with_only_required_metadata_is_valid(self):
        uploaded_file = File.objects.create(name="notes.txt", type="text/plain")

        self.assertEqual(uploaded_file.link, "")
        self.assertEqual(uploaded_file.storage_path, "")
        self.assertIsNone(uploaded_file.size)

    def test_private_media_root_is_separate_from_public_media_root(self):
        self.assertEqual(settings.PRIVATE_MEDIA_ROOT.name, "private_media")
        self.assertNotEqual(settings.PRIVATE_MEDIA_ROOT, settings.MEDIA_ROOT)
        self.assertFalse(hasattr(settings, "PRIVATE_MEDIA_URL"))


class TagScopeApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone_number="1000", password="password")
        self.people_tag = Tag.objects.create(title="Designer", scope=TagScope.USER)
        self.group_tag = Tag.objects.create(title="Study", scope=TagScope.GROUP)

        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = self.user.pk
        session.save()
        self.client_for_user = client

    def test_tags_default_to_the_people_vocabulary(self):
        response = self.client_for_user.get("/api/tags/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([tag["title"] for tag in response.data], ["Designer"])
        self.assertEqual(response.data[0]["scope"], TagScope.USER)

    def test_group_scope_returns_only_group_tags(self):
        response = self.client_for_user.get("/api/tags/", {"scope": "group"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([tag["title"] for tag in response.data], ["Study"])

    def test_unknown_scope_is_rejected(self):
        response = self.client_for_user.get("/api/tags/", {"scope": "planets"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("scope", response.data)

    def test_a_group_tag_cannot_be_attached_to_a_person(self):
        response = self.client_for_user.patch(
            "/api/auth/me/", {"tag": self.group_tag.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tag", response.data)

    def test_a_people_tag_cannot_be_attached_to_a_group(self):
        response = self.client_for_user.post(
            "/api/groups/",
            {"name": "Study group", "tag": self.people_tag.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tag", response.data)

    def test_each_side_accepts_its_own_vocabulary(self):
        profile = self.client_for_user.patch(
            "/api/auth/me/", {"tag": self.people_tag.pk}, format="json"
        )
        group = self.client_for_user.post(
            "/api/groups/",
            {"name": "Study group", "tag": self.group_tag.pk},
            format="json",
        )

        self.assertEqual(profile.status_code, 200)
        self.assertEqual(group.status_code, 201)
        self.assertEqual(group.data["tag"]["title"], "Study")


class BioTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone_number="1000", password="password")
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = self.user.pk
        session.save()
        self.client_for_user = client

    def test_bio_is_saved_and_returned(self):
        response = self.client_for_user.patch(
            "/api/auth/me/", {"bio": "Builds things"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bio"], "Builds things")
        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, "Builds things")

    def test_bio_longer_than_the_limit_is_rejected(self):
        response = self.client_for_user.patch(
            "/api/auth/me/", {"bio": "x" * (BIO_MAX_LENGTH + 1)}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)

    def test_bio_exactly_at_the_limit_is_accepted(self):
        response = self.client_for_user.patch(
            "/api/auth/me/", {"bio": "x" * BIO_MAX_LENGTH}, format="json"
        )

        self.assertEqual(response.status_code, 200)

    def test_bio_appears_on_the_public_profile(self):
        self.user.bio = "Builds things"
        self.user.save(update_fields=["bio"])
        other = User.objects.create_user(phone_number="2000", password="password")
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = other.pk
        session.save()

        response = client.get(f"/api/users/{self.user.pk}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bio"], "Builds things")

    def test_signup_accepts_a_bio(self):
        response = APIClient().post(
            "/api/auth/register/",
            {
                "phone_number": "5000",
                "password": "a-strong-passphrase-42",
                "first_name": "Ada",
                "bio": "Counts things",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["bio"], "Counts things")

    def test_group_bio_longer_than_the_limit_is_rejected(self):
        response = self.client_for_user.post(
            "/api/groups/",
            {"name": "Study group", "bio": "x" * (BIO_MAX_LENGTH + 1)},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)
