from django.test import TestCase
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

from .services import create_text_message, mark_chat_read
from .unread import unread_summaries, unread_summary


class UnreadFixtureMixin:
    def build_conversations(self):
        self.alice = User.objects.create_user(
            phone_number="+989120001000", password="password", first_name="Alice"
        )
        self.bob = User.objects.create_user(
            phone_number="+989120002000", password="password", first_name="Bob"
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
        self.other_topic = Topic.objects.create(name="random", channel=self.channel)

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client


class UnreadCountTests(UnreadFixtureMixin, TestCase):
    def setUp(self):
        self.build_conversations()

    def test_a_never_opened_chat_counts_everything(self):
        for index in range(3):
            create_text_message(self.alice, self.group, f"message {index}")

        summary = unread_summary(self.bob, self.group)

        self.assertEqual(summary["unread_count"], 3)

    def test_first_unread_is_the_oldest_one_not_seen(self):
        first = create_text_message(self.alice, self.group, "one")
        create_text_message(self.alice, self.group, "two")

        summary = unread_summary(self.bob, self.group)

        self.assertEqual(summary["first_unread_message_id"], first.pk)

    def test_reading_clears_the_count(self):
        create_text_message(self.alice, self.group, "one")
        create_text_message(self.alice, self.group, "two")

        mark_chat_read(self.bob, self.group)
        summary = unread_summary(self.bob, self.group)

        self.assertEqual(summary["unread_count"], 0)
        self.assertIsNone(summary["first_unread_message_id"])

    def test_reading_part_way_leaves_the_rest_unread(self):
        first = create_text_message(self.alice, self.group, "one")
        second = create_text_message(self.alice, self.group, "two")
        third = create_text_message(self.alice, self.group, "three")

        mark_chat_read(self.bob, self.group, first.pk)
        summary = unread_summary(self.bob, self.group)

        self.assertEqual(summary["unread_count"], 2)
        self.assertEqual(summary["first_unread_message_id"], second.pk)
        self.assertNotEqual(summary["first_unread_message_id"], third.pk)

    def test_your_own_messages_are_never_unread_to_you(self):
        create_text_message(self.bob, self.group, "mine")
        create_text_message(self.bob, self.group, "also mine")

        self.assertEqual(unread_summary(self.bob, self.group)["unread_count"], 0)

    def test_a_deleted_senders_message_still_counts(self):
        """SQL's NULL handling must not quietly drop these."""
        stranger = User.objects.create_user(
            phone_number="+989120009000", password="password"
        )
        GroupMembership.objects.create(group=self.group, user=stranger)
        create_text_message(stranger, self.group, "from someone since deleted")
        stranger.delete()

        self.assertEqual(unread_summary(self.bob, self.group)["unread_count"], 1)

    def test_deleted_messages_do_not_count(self):
        message = create_text_message(self.alice, self.group, "gone")
        message.is_deleted = True
        message.save(update_fields=["is_deleted"])

        self.assertEqual(unread_summary(self.bob, self.group)["unread_count"], 0)

    def test_unread_is_per_person(self):
        create_text_message(self.alice, self.group, "hello")

        self.assertEqual(unread_summary(self.bob, self.group)["unread_count"], 1)
        self.assertEqual(unread_summary(self.alice, self.group)["unread_count"], 0)

    def test_counts_do_not_leak_between_chats(self):
        create_text_message(self.alice, self.group, "in the group")
        create_text_message(self.alice, self.direct_chat, "in the direct chat")
        create_text_message(self.alice, self.direct_chat, "and again")

        summaries = unread_summaries(
            self.bob, [self.group.pk, self.direct_chat.pk, self.topic.pk]
        )

        self.assertEqual(summaries[self.group.pk]["unread_count"], 1)
        self.assertEqual(summaries[self.direct_chat.pk]["unread_count"], 2)
        self.assertNotIn(self.topic.pk, summaries)

    def test_many_chats_are_summarised_in_a_constant_number_of_queries(self):
        create_text_message(self.alice, self.group, "a")
        create_text_message(self.alice, self.direct_chat, "b")
        create_text_message(self.alice, self.topic, "c")
        create_text_message(self.alice, self.other_topic, "d")
        chat_ids = [
            self.group.pk,
            self.direct_chat.pk,
            self.topic.pk,
            self.other_topic.pk,
        ]

        # One for the watermarks, one for the grouped message counts —
        # regardless of how many conversations are being asked about.
        with self.assertNumQueries(2):
            unread_summaries(self.bob, chat_ids)

    def test_muting_does_not_stop_something_being_unread(self):
        """Silencing a room is about interruption, not about having read it."""
        from .models import ChatMute

        ChatMute.objects.create(chat=self.group, user=self.bob)
        create_text_message(self.alice, self.group, "still unread")

        self.assertEqual(unread_summary(self.bob, self.group)["unread_count"], 1)


class UnreadApiTests(UnreadFixtureMixin, TestCase):
    def setUp(self):
        self.build_conversations()

    def test_conversation_index_reports_unread_per_conversation(self):
        create_text_message(self.alice, self.group, "one")
        create_text_message(self.alice, self.group, "two")
        create_text_message(self.alice, self.direct_chat, "hi")
        create_text_message(self.alice, self.topic, "topic post")

        index = self.authenticated_client(self.bob).get("/api/chats/").data

        self.assertEqual(index["groups"][0]["unread_count"], 2)
        self.assertEqual(index["private_chats"][0]["unread_count"], 1)
        topic = next(
            item
            for item in index["channels"][0]["topics"]
            if item["id"] == self.topic.pk
        )
        self.assertEqual(topic["unread_count"], 1)

    def test_a_channel_totals_the_topics_inside_it(self):
        create_text_message(self.alice, self.topic, "one")
        create_text_message(self.alice, self.topic, "two")
        create_text_message(self.alice, self.other_topic, "three")

        index = self.authenticated_client(self.bob).get("/api/chats/").data

        self.assertEqual(index["channels"][0]["unread_count"], 3)

    def test_index_carries_the_first_unread_message(self):
        first = create_text_message(self.alice, self.group, "one")
        create_text_message(self.alice, self.group, "two")

        index = self.authenticated_client(self.bob).get("/api/chats/").data

        self.assertEqual(index["groups"][0]["first_unread_message_id"], first.pk)

    def test_history_reports_unread_before_anything_marks_it_read(self):
        create_text_message(self.alice, self.group, "one")
        second = create_text_message(self.alice, self.group, "two")

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/"
        )

        self.assertEqual(response.data["unread_count"], 2)
        self.assertNotEqual(response.data["first_unread_message_id"], second.pk)

    def test_history_can_open_at_the_first_unread(self):
        messages = [
            create_text_message(self.alice, self.group, f"message {index}")
            for index in range(40)
        ]
        mark_chat_read(self.bob, self.group, messages[9].pk)

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"anchor": "unread", "limit": 10},
        )
        returned_ids = [item["id"] for item in response.data["results"]]

        self.assertEqual(response.data["first_unread_message_id"], messages[10].pk)
        self.assertIn(messages[10].pk, returned_ids)
        # A little already-read context comes along above it.
        self.assertIn(messages[9].pk, returned_ids)
        # ...and there is more below, which the client must be able to reach.
        self.assertTrue(response.data["has_newer"])

    def test_anchor_unread_falls_back_to_the_newest_page_when_caught_up(self):
        messages = [
            create_text_message(self.alice, self.group, f"message {index}")
            for index in range(30)
        ]
        mark_chat_read(self.bob, self.group)

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"anchor": "unread", "limit": 10},
        )
        returned_ids = [item["id"] for item in response.data["results"]]

        self.assertEqual(returned_ids[-1], messages[-1].pk)
        self.assertFalse(response.data["has_newer"])

    def test_history_can_page_forward(self):
        messages = [
            create_text_message(self.alice, self.group, f"message {index}")
            for index in range(30)
        ]

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"after": messages[4].pk, "limit": 5},
        )
        returned_ids = [item["id"] for item in response.data["results"]]

        self.assertEqual(returned_ids, [message.pk for message in messages[5:10]])
        self.assertTrue(response.data["has_older"])
        self.assertTrue(response.data["has_newer"])

    def test_paging_forward_to_the_end_reports_no_more(self):
        messages = [
            create_text_message(self.alice, self.group, f"message {index}")
            for index in range(10)
        ]

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"after": messages[4].pk, "limit": 20},
        )

        self.assertFalse(response.data["has_newer"])
        self.assertTrue(response.data["has_older"])

    def test_paging_forward_from_an_unknown_message_is_a_404(self):
        create_text_message(self.alice, self.group, "one")

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"after": 999999},
        )

        self.assertEqual(response.status_code, 404)

    def test_backwards_paging_still_works(self):
        messages = [
            create_text_message(self.alice, self.group, f"message {index}")
            for index in range(30)
        ]

        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/",
            {"before": messages[10].pk, "limit": 5},
        )
        returned_ids = [item["id"] for item in response.data["results"]]

        self.assertEqual(returned_ids, [message.pk for message in messages[5:10]])
        self.assertTrue(response.data["has_older"])
        self.assertTrue(response.data["has_newer"])

    def test_empty_chat_reports_no_unread(self):
        response = self.authenticated_client(self.bob).get(
            f"/api/chats/{self.group.pk}/messages/history/"
        )

        self.assertEqual(response.data["unread_count"], 0)
        self.assertIsNone(response.data["first_unread_message_id"])
