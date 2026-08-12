from django.core.exceptions import PermissionDenied, ValidationError
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
from .permissions import (
    can_access_chat,
    can_discover_channel,
    can_send_media_to_chat,
    can_send_to_chat,
    is_channel_member,
)
from .serializers import CHANNEL_NAME_MAX_LENGTH, GROUP_NAME_MAX_LENGTH
from .services import (
    add_channel_member,
    add_group_member,
    build_direct_chat_key,
    create_channel,
    create_group,
    create_topic,
    delete_channel,
    delete_group,
    get_or_create_direct_chat,
    join_group_via_token,
    remove_group_member,
    set_channel_admin,
    update_group,
)


class AuthenticatedClientMixin:
    """Session-authenticated API clients, the way the app authenticates."""

    def authenticated_client(self, user):
        client = APIClient()
        session = client.session
        session[APP_USER_SESSION_KEY] = user.pk
        session.save()
        return client


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

    def test_topic_in_public_channel_still_requires_membership(self):
        """Public means discoverable, not readable.

        A stranger may find the channel and browse its topic list — that is
        what `can_discover_channel` is for — but the conversation inside is
        for members, and joining is the step in between.
        """
        channel = Channel.objects.create(
            name="Public channel", owner=self.owner, access_level=AccessLevel.PUBLIC
        )
        topic = Topic.objects.create(
            name="Public topic",
            channel=channel,
            access_level=AccessLevel.PUBLIC,
        )

        self.assert_cannot_access_or_send(self.third_user, topic)
        self.assertTrue(can_discover_channel(self.third_user, channel))

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
            name="Private channel",
            owner=self.owner,
            access_level=AccessLevel.PRIVATE,
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
        self.assertFalse(can_discover_channel(self.third_user, channel))

    def test_topic_can_be_closed_to_everyone_but_admins(self):
        channel = Channel.objects.create(name="Locked channel", owner=self.owner)
        topic = Topic.objects.create(
            name="Announcements", channel=channel, allow_member_messages=False
        )
        ChannelMembership.objects.create(channel=channel, user=self.member)

        # Reading is unaffected; only posting closes.
        self.assertTrue(can_access_chat(self.member, topic))
        self.assertFalse(can_send_to_chat(self.member, topic))
        # An admin is never silenced by their own switch.
        self.assert_can_access_and_send(self.owner, topic)

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


class DirectChatApiTests(AuthenticatedClientMixin, TestCase):
    url = "/api/chats/direct/"

    def setUp(self):
        self.alice = User.objects.create_user(
            phone_number="1000", password="password"
        )
        self.bob = User.objects.create_user(phone_number="2000", password="password")

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


class GroupServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(phone_number="1000", password="password")
        self.member = User.objects.create_user(phone_number="2000", password="password")
        self.outsider = User.objects.create_user(
            phone_number="3000", password="password"
        )

    def test_creating_a_group_enrols_the_owner_and_issues_an_invite_token(self):
        group = create_group(self.owner, name="  Study group  ", bio="We study")

        self.assertEqual(group.name, "Study group")
        self.assertEqual(group.owner, self.owner)
        self.assertTrue(group.link)
        self.assertTrue(
            GroupMembership.objects.filter(group=group, user=self.owner).exists()
        )

    def test_group_starts_with_media_disabled(self):
        group = create_group(self.owner, name="Quiet group")

        self.assertFalse(group.allow_media)

    def test_owner_can_upload_but_member_cannot_until_media_is_enabled(self):
        group = create_group(self.owner, name="Quiet group")
        add_group_member(self.owner, group, self.member)

        self.assertTrue(can_send_media_to_chat(self.owner, group))
        self.assertFalse(can_send_media_to_chat(self.member, group))

        update_group(self.owner, group, {"allow_media": True})

        self.assertTrue(can_send_media_to_chat(self.member, group))

    def test_blank_group_name_is_rejected(self):
        with self.assertRaises(ValidationError):
            create_group(self.owner, name="   ")

    def test_invite_tokens_are_unique_across_groups(self):
        first = create_group(self.owner, name="First")
        second = create_group(self.owner, name="Second")

        self.assertNotEqual(first.link, second.link)

    def test_only_the_owner_can_edit_the_profile(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        with self.assertRaises(PermissionDenied):
            update_group(self.member, group, {"name": "Hijacked"})

        group.refresh_from_db()
        self.assertEqual(group.name, "Study group")

    def test_update_rejects_fields_that_are_not_editable(self):
        group = create_group(self.owner, name="Study group")

        with self.assertRaises(ValidationError):
            update_group(self.owner, group, {"link": "custom-token"})

    def test_only_the_owner_can_delete_the_group(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        with self.assertRaises(PermissionDenied):
            delete_group(self.member, group)

        delete_group(self.owner, group)

        group.refresh_from_db()
        self.assertTrue(group.is_deleted)
        self.assertFalse(can_access_chat(self.member, group))

    def test_owner_can_add_a_member_who_allows_it(self):
        group = create_group(self.owner, name="Study group")

        _, created = add_group_member(self.owner, group, self.member)

        self.assertTrue(created)
        self.assert_can_access_and_send(self.member, group)

    def test_adding_a_member_twice_is_idempotent(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        _, created = add_group_member(self.owner, group, self.member)

        self.assertFalse(created)
        self.assertEqual(
            GroupMembership.objects.filter(group=group, user=self.member).count(), 1
        )

    def test_member_cannot_be_added_when_they_opted_out(self):
        self.member.can_be_added_to_group = False
        self.member.save(update_fields=["can_be_added_to_group"])
        group = create_group(self.owner, name="Study group")

        with self.assertRaises(PermissionDenied):
            add_group_member(self.owner, group, self.member)

        self.assertFalse(can_access_chat(self.member, group))

    def test_a_member_cannot_add_other_people(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        with self.assertRaises(PermissionDenied):
            add_group_member(self.member, group, self.outsider)

    def test_owner_can_remove_a_member(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        self.assertTrue(remove_group_member(self.owner, group, self.member))
        self.assertFalse(can_access_chat(self.member, group))

    def test_a_member_cannot_remove_anyone(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)
        add_group_member(self.owner, group, self.outsider)

        with self.assertRaises(PermissionDenied):
            remove_group_member(self.member, group, self.outsider)

    def test_the_owner_cannot_be_removed(self):
        group = create_group(self.owner, name="Study group")

        with self.assertRaises(ValidationError):
            remove_group_member(self.owner, group, self.owner)

    def test_invite_link_joins_the_group(self):
        group = create_group(self.owner, name="Study group")

        joined_group, created = join_group_via_token(self.outsider, group.link)

        self.assertEqual(joined_group.pk, group.pk)
        self.assertTrue(created)
        self.assert_can_access_and_send(self.outsider, group)

    def test_invite_link_works_even_when_the_user_opted_out_of_being_added(self):
        # Opening the link is the user's own consent, so the "allow adding me"
        # switch — which only gates *other people* adding them — does not apply.
        self.outsider.can_be_added_to_group = False
        self.outsider.save(update_fields=["can_be_added_to_group"])
        group = create_group(self.owner, name="Study group")

        join_group_via_token(self.outsider, group.link)

        self.assert_can_access_and_send(self.outsider, group)

    def test_joining_twice_does_not_duplicate_membership(self):
        group = create_group(self.owner, name="Study group")
        join_group_via_token(self.outsider, group.link)

        _, created = join_group_via_token(self.outsider, group.link)

        self.assertFalse(created)
        self.assertEqual(
            GroupMembership.objects.filter(group=group, user=self.outsider).count(), 1
        )

    def test_unknown_or_deleted_invite_tokens_are_rejected(self):
        group = create_group(self.owner, name="Study group")
        delete_group(self.owner, group)

        with self.assertRaises(ValidationError):
            join_group_via_token(self.outsider, group.link)
        with self.assertRaises(ValidationError):
            join_group_via_token(self.outsider, "not-a-real-token")

    def assert_can_access_and_send(self, user, chat):
        self.assertTrue(can_access_chat(user, chat))
        self.assertTrue(can_send_to_chat(user, chat))


class GroupApiTests(AuthenticatedClientMixin, TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(phone_number="1000", password="password")
        self.member = User.objects.create_user(phone_number="2000", password="password")
        self.outsider = User.objects.create_user(
            phone_number="3000", password="password"
        )

    def test_owner_creates_a_group(self):
        response = self.authenticated_client(self.owner).post(
            "/api/groups/", {"name": "Study group", "bio": "We study"}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Study group")
        self.assertTrue(response.data["is_owner"])
        self.assertFalse(response.data["allow_media"])
        self.assertEqual(response.data["member_count"], 1)
        self.assertTrue(response.data["invite_link"])

    def test_creating_a_group_without_a_name_is_rejected(self):
        response = self.authenticated_client(self.owner).post(
            "/api/groups/", {"bio": "No name"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_group_name_is_capped(self):
        client = self.authenticated_client(self.owner)

        at_limit = client.post(
            "/api/groups/",
            {"name": "n" * GROUP_NAME_MAX_LENGTH},
            format="json",
        )
        over_limit = client.post(
            "/api/groups/",
            {"name": "n" * (GROUP_NAME_MAX_LENGTH + 1)},
            format="json",
        )

        self.assertEqual(at_limit.status_code, 201)
        self.assertEqual(over_limit.status_code, 400)
        self.assertIn("name", over_limit.data)

    def test_renaming_a_group_past_the_cap_is_rejected(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).patch(
            f"/api/groups/{group.pk}/",
            {"name": "n" * (GROUP_NAME_MAX_LENGTH + 1)},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)
        group.refresh_from_db()
        self.assertEqual(group.name, "Study group")

    def test_members_can_read_the_group_profile(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).get(
            f"/api/groups/{group.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_owner"])
        self.assertEqual(response.data["owner"]["phone_number"], self.owner.pk)
        self.assertEqual(
            {item["user"]["phone_number"] for item in response.data["members"]},
            {self.owner.pk, self.member.pk},
        )
        # The owner is listed first and flagged.
        self.assertTrue(response.data["members"][0]["is_owner"])

    def test_outsiders_cannot_read_the_group_profile(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.outsider).get(
            f"/api/groups/{group.pk}/"
        )

        self.assertEqual(response.status_code, 403)

    def test_owner_edits_the_profile(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).patch(
            f"/api/groups/{group.pk}/",
            {"name": "Reading group", "bio": "We read", "allow_media": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        group.refresh_from_db()
        self.assertEqual(group.name, "Reading group")
        self.assertEqual(group.bio, "We read")
        self.assertTrue(group.allow_media)

    def test_members_cannot_edit_the_profile(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).patch(
            f"/api/groups/{group.pk}/", {"name": "Hijacked"}, format="json"
        )

        self.assertEqual(response.status_code, 403)

    def test_owner_deletes_the_group(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).delete(
            f"/api/groups/{group.pk}/"
        )

        self.assertEqual(response.status_code, 204)
        group.refresh_from_db()
        self.assertTrue(group.is_deleted)

    def test_members_cannot_delete_the_group(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).delete(
            f"/api/groups/{group.pk}/"
        )

        self.assertEqual(response.status_code, 403)

    def test_owner_adds_a_member_by_phone_number(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).post(
            f"/api/groups/{group.pk}/members/", {"user": self.member.pk}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["member_count"], 2)

    def test_adding_a_user_who_opted_out_is_forbidden(self):
        self.member.can_be_added_to_group = False
        self.member.save(update_fields=["can_be_added_to_group"])
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).post(
            f"/api/groups/{group.pk}/members/", {"user": self.member.pk}, format="json"
        )

        self.assertEqual(response.status_code, 403)

    def test_members_cannot_add_people(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).post(
            f"/api/groups/{group.pk}/members/",
            {"user": self.outsider.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_owner_removes_a_member(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.owner).delete(
            f"/api/groups/{group.pk}/members/{self.member.pk}/"
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(can_access_chat(self.member, group))

    def test_removing_someone_who_is_not_a_member_returns_404(self):
        group = create_group(self.owner, name="Study group")

        response = self.authenticated_client(self.owner).delete(
            f"/api/groups/{group.pk}/members/{self.outsider.pk}/"
        )

        self.assertEqual(response.status_code, 404)

    def test_invite_preview_and_join(self):
        group = create_group(self.owner, name="Study group")
        client = self.authenticated_client(self.outsider)

        preview = client.get(f"/api/groups/join/{group.link}/")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["name"], "Study group")
        self.assertFalse(preview.data["is_member"])

        joined = client.post(f"/api/groups/join/{group.link}/")
        self.assertEqual(joined.status_code, 201)
        self.assertEqual(joined.data["id"], group.pk)
        self.assertEqual(joined.data["member_count"], 2)
        self.assertTrue(can_access_chat(self.outsider, group))

    def test_joining_with_an_unknown_token_is_rejected(self):
        response = self.authenticated_client(self.outsider).post(
            "/api/groups/join/not-a-real-token/"
        )

        self.assertEqual(response.status_code, 400)

    def test_conversation_index_lists_groups_with_their_profile(self):
        group = create_group(self.owner, name="Study group", bio="We study")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).get("/api/chats/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["groups"]), 1)
        listed_group = response.data["groups"][0]
        self.assertEqual(listed_group["name"], "Study group")
        self.assertEqual(listed_group["bio"], "We study")
        self.assertEqual(listed_group["member_count"], 2)
        self.assertFalse(listed_group["is_owner"])
        self.assertFalse(listed_group["allow_media"])

    def test_deleted_groups_disappear_from_the_conversation_index(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)
        delete_group(self.owner, group)

        response = self.authenticated_client(self.member).get("/api/chats/")

        self.assertEqual(response.data["groups"], [])


class GroupInviteRotationTests(AuthenticatedClientMixin, TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(phone_number="1000", password="password")
        self.member = User.objects.create_user(
            phone_number="2000", password="password"
        )

    def test_owner_rotates_the_invite_and_the_old_token_stops_working(self):
        group = create_group(self.owner, name="Study group")
        old_token = group.link

        response = self.authenticated_client(self.owner).post(
            f"/api/groups/{group.pk}/invite/reset/"
        )

        self.assertEqual(response.status_code, 200)
        new_token = response.data["invite_link"]
        self.assertTrue(new_token)
        self.assertNotEqual(new_token, old_token)

        stale = self.authenticated_client(self.member).post(
            f"/api/groups/join/{old_token}/"
        )
        self.assertEqual(stale.status_code, 400)

        fresh = self.authenticated_client(self.member).post(
            f"/api/groups/join/{new_token}/"
        )
        self.assertEqual(fresh.status_code, 201)

    def test_members_cannot_rotate_the_invite(self):
        group = create_group(self.owner, name="Study group")
        add_group_member(self.owner, group, self.member)

        response = self.authenticated_client(self.member).post(
            f"/api/groups/{group.pk}/invite/reset/"
        )

        self.assertEqual(response.status_code, 403)
        group.refresh_from_db()
        self.assertTrue(group.link)


class ChannelApiTests(AuthenticatedClientMixin, TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(phone_number="1000", password="password")
        self.admin = User.objects.create_user(phone_number="2000", password="password")
        self.member = User.objects.create_user(
            phone_number="3000", password="password"
        )
        self.outsider = User.objects.create_user(
            phone_number="4000", password="password"
        )

    def make_channel(self, **kwargs):
        """A channel with an admin and a plain member already in it."""
        channel = create_channel(self.owner, name=kwargs.pop("name", "University A"), **kwargs)
        add_channel_member(self.owner, channel, self.admin)
        set_channel_admin(self.owner, channel, self.admin, True)
        add_channel_member(self.owner, channel, self.member)
        return channel

    def test_owner_creates_a_channel_and_is_enrolled_as_an_admin(self):
        response = self.authenticated_client(self.owner).post(
            "/api/channels/",
            {"name": "University A", "bio": "Course chats"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "University A")
        self.assertTrue(response.data["is_owner"])
        self.assertTrue(response.data["is_admin"])
        self.assertEqual(response.data["member_count"], 1)
        self.assertEqual(response.data["topics"], [])
        self.assertTrue(response.data["invite_link"])

    def test_channel_names_are_unique_regardless_of_case(self):
        client = self.authenticated_client(self.owner)
        client.post("/api/channels/", {"name": "University A"}, format="json")

        duplicate = client.post(
            "/api/channels/", {"name": "university a"}, format="json"
        )

        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("name", duplicate.data)

    def test_a_deleted_channel_frees_its_name(self):
        channel = create_channel(self.owner, name="University A")
        delete_channel(self.owner, channel)

        response = self.authenticated_client(self.admin).post(
            "/api/channels/", {"name": "University A"}, format="json"
        )

        self.assertEqual(response.status_code, 201)

    def test_channel_name_is_capped(self):
        response = self.authenticated_client(self.owner).post(
            "/api/channels/",
            {"name": "n" * (CHANNEL_NAME_MAX_LENGTH + 1)},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_only_the_owner_promotes_and_demotes_admins(self):
        channel = self.make_channel()

        rejected = self.authenticated_client(self.admin).patch(
            f"/api/channels/{channel.pk}/members/{self.member.pk}/",
            {"is_admin": True},
            format="json",
        )
        self.assertEqual(rejected.status_code, 403)

        promoted = self.authenticated_client(self.owner).patch(
            f"/api/channels/{channel.pk}/members/{self.member.pk}/",
            {"is_admin": True},
            format="json",
        )
        self.assertEqual(promoted.status_code, 200)
        self.assertTrue(
            ChannelMembership.objects.get(
                channel=channel, user=self.member
            ).is_admin
        )

        demoted = self.authenticated_client(self.owner).patch(
            f"/api/channels/{channel.pk}/members/{self.member.pk}/",
            {"is_admin": False},
            format="json",
        )
        self.assertEqual(demoted.status_code, 200)
        self.assertFalse(
            ChannelMembership.objects.get(
                channel=channel, user=self.member
            ).is_admin
        )

    def test_admins_add_members_but_plain_members_cannot(self):
        channel = self.make_channel()

        added = self.authenticated_client(self.admin).post(
            f"/api/channels/{channel.pk}/members/",
            {"user": self.outsider.pk},
            format="json",
        )
        self.assertEqual(added.status_code, 201)

        rejected = self.authenticated_client(self.member).post(
            f"/api/channels/{channel.pk}/members/",
            {"user": self.outsider.pk},
            format="json",
        )
        self.assertEqual(rejected.status_code, 403)

    def test_a_user_who_opted_out_cannot_be_added_to_a_channel(self):
        channel = self.make_channel()
        self.outsider.can_be_added_to_channel = False
        self.outsider.save(update_fields=("can_be_added_to_channel",))

        response = self.authenticated_client(self.owner).post(
            f"/api/channels/{channel.pk}/members/",
            {"user": self.outsider.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(is_channel_member(self.outsider, channel))

    def test_the_group_switch_does_not_gate_channels(self):
        channel = self.make_channel()
        self.outsider.can_be_added_to_group = False
        self.outsider.save(update_fields=("can_be_added_to_group",))

        response = self.authenticated_client(self.owner).post(
            f"/api/channels/{channel.pk}/members/",
            {"user": self.outsider.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_an_admin_cannot_remove_another_admin_but_the_owner_can(self):
        channel = self.make_channel()
        add_channel_member(self.owner, channel, self.outsider)
        set_channel_admin(self.owner, channel, self.outsider, True)

        rejected = self.authenticated_client(self.admin).delete(
            f"/api/channels/{channel.pk}/members/{self.outsider.pk}/"
        )
        self.assertEqual(rejected.status_code, 403)

        allowed = self.authenticated_client(self.owner).delete(
            f"/api/channels/{channel.pk}/members/{self.outsider.pk}/"
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertFalse(is_channel_member(self.outsider, channel))

    def test_the_owner_cannot_be_removed_from_their_own_channel(self):
        channel = self.make_channel()

        response = self.authenticated_client(self.owner).delete(
            f"/api/channels/{channel.pk}/members/{self.owner.pk}/"
        )

        self.assertEqual(response.status_code, 400)

    def test_only_the_owner_deletes_a_channel_and_its_topics_go_with_it(self):
        channel = self.make_channel()
        topic = create_topic(self.owner, channel, name="Course 1")

        rejected = self.authenticated_client(self.admin).delete(
            f"/api/channels/{channel.pk}/"
        )
        self.assertEqual(rejected.status_code, 403)

        deleted = self.authenticated_client(self.owner).delete(
            f"/api/channels/{channel.pk}/"
        )
        self.assertEqual(deleted.status_code, 204)

        channel.refresh_from_db()
        topic.refresh_from_db()
        self.assertTrue(channel.is_deleted)
        self.assertTrue(topic.is_deleted)
        self.assertFalse(can_access_chat(self.member, topic))

    def test_admins_manage_topics_and_members_cannot(self):
        channel = self.make_channel()

        created = self.authenticated_client(self.admin).post(
            f"/api/channels/{channel.pk}/topics/",
            {"name": "Course 1", "bio": "Week by week"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        topic_id = created.data["id"]
        self.assertTrue(created.data["allow_member_messages"])

        rejected = self.authenticated_client(self.member).post(
            f"/api/channels/{channel.pk}/topics/",
            {"name": "Course 2"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 403)

        renamed = self.authenticated_client(self.admin).patch(
            f"/api/channels/{channel.pk}/topics/{topic_id}/",
            {"name": "Course One"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.data["name"], "Course One")

        removed = self.authenticated_client(self.admin).delete(
            f"/api/channels/{channel.pk}/topics/{topic_id}/"
        )
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(Topic.objects.filter(pk=topic_id, is_deleted=False).exists())

    def test_admins_toggle_the_topic_posting_lock(self):
        channel = self.make_channel()
        topic = create_topic(self.owner, channel, name="Announcements")

        response = self.authenticated_client(self.admin).patch(
            f"/api/channels/{channel.pk}/topics/{topic.pk}/",
            {"allow_member_messages": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["allow_member_messages"])

        topic.refresh_from_db()
        self.assertFalse(can_send_to_chat(self.member, topic))
        self.assertTrue(can_send_to_chat(self.admin, topic))

    def test_public_channels_are_discoverable_and_self_serve(self):
        channel = create_channel(
            self.owner, name="University A", access_level=AccessLevel.PUBLIC
        )
        create_topic(self.owner, channel, name="Course 1")
        client = self.authenticated_client(self.outsider)

        listed = client.get("/api/channels/discover/", {"q": "universi"})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["name"] for item in listed.data], ["University A"])
        self.assertFalse(listed.data[0]["is_member"])

        # A stranger sees what the channel is and what is in it, but not who.
        preview = client.get(f"/api/channels/{channel.pk}/")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual([item["name"] for item in preview.data["topics"]], ["Course 1"])
        self.assertEqual(preview.data["members"], [])
        self.assertIsNone(preview.data["invite_link"])

        joined = client.post(f"/api/channels/{channel.pk}/join/")
        self.assertEqual(joined.status_code, 201)
        self.assertTrue(joined.data["is_member"])
        self.assertEqual(len(joined.data["members"]), 2)

    def test_private_channels_are_hidden_and_cannot_be_self_joined(self):
        channel = create_channel(
            self.owner, name="Secret", access_level=AccessLevel.PRIVATE
        )
        client = self.authenticated_client(self.outsider)

        self.assertEqual(client.get("/api/channels/discover/").data, [])
        self.assertEqual(client.get(f"/api/channels/{channel.pk}/").status_code, 404)
        self.assertEqual(
            client.post(f"/api/channels/{channel.pk}/join/").status_code, 404
        )

    def test_a_private_channel_is_still_reachable_by_invite_link(self):
        channel = create_channel(
            self.owner, name="Secret", access_level=AccessLevel.PRIVATE
        )
        client = self.authenticated_client(self.outsider)

        preview = client.get(f"/api/channels/join/{channel.link}/")
        self.assertEqual(preview.status_code, 200)
        self.assertFalse(preview.data["is_member"])

        joined = client.post(f"/api/channels/join/{channel.link}/")
        self.assertEqual(joined.status_code, 201)
        self.assertTrue(is_channel_member(self.outsider, channel))

    def test_admins_rotate_the_channel_invite_and_members_cannot(self):
        channel = self.make_channel()
        old_token = channel.link

        rejected = self.authenticated_client(self.member).post(
            f"/api/channels/{channel.pk}/invite/reset/"
        )
        self.assertEqual(rejected.status_code, 403)

        rotated = self.authenticated_client(self.admin).post(
            f"/api/channels/{channel.pk}/invite/reset/"
        )
        self.assertEqual(rotated.status_code, 200)
        self.assertNotEqual(rotated.data["invite_link"], old_token)

        stale = self.authenticated_client(self.outsider).post(
            f"/api/channels/join/{old_token}/"
        )
        self.assertEqual(stale.status_code, 400)
        self.assertFalse(is_channel_member(self.outsider, channel))

    def test_only_admins_are_told_the_invite_link(self):
        channel = self.make_channel()

        as_member = self.authenticated_client(self.member).get(
            f"/api/channels/{channel.pk}/"
        )
        as_admin = self.authenticated_client(self.admin).get(
            f"/api/channels/{channel.pk}/"
        )

        self.assertIsNone(as_member.data["invite_link"])
        self.assertTrue(as_admin.data["invite_link"])

    def test_channels_appear_in_the_conversation_index_with_their_topics(self):
        channel = self.make_channel()
        create_topic(self.owner, channel, name="Course 1")

        response = self.authenticated_client(self.member).get("/api/chats/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["channels"]), 1)
        listed = response.data["channels"][0]
        self.assertEqual(listed["name"], "University A")
        self.assertFalse(listed["is_admin"])
        self.assertEqual([item["name"] for item in listed["topics"]], ["Course 1"])

    def test_outsiders_see_no_channels_in_their_index(self):
        self.make_channel()

        response = self.authenticated_client(self.outsider).get("/api/chats/")

        self.assertEqual(response.data["channels"], [])
