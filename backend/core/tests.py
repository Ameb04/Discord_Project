from django.conf import settings
from django.test import TestCase

from .models import File


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
