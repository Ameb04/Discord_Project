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
from .permissions import can_access_chat, can_send_media_to_chat, can_send_to_chat
from .services import (
    add_group_member,
    build_direct_chat_key,
    create_group,
    delete_group,
    get_or_create_direct_chat,
    join_group_via_token,
    remove_group_member,
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
