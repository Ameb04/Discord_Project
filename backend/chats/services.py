from secrets import token_urlsafe

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q

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
    is_channel_admin,
    is_channel_member,
    is_channel_owner,
    is_group_member,
    is_group_owner,
)

JOIN_TOKEN_BYTES = 16
_JOIN_TOKEN_ATTEMPTS = 5

# Fields the owner may change after creation. `link` is deliberately absent:
# the invite token is server-issued so an owner cannot squat a guessable one,
# and rotating it goes through `rotate_*_invite` instead.
EDITABLE_GROUP_FIELDS = ("name", "bio", "tag", "avatar", "allow_media", "access_level")

EDITABLE_CHANNEL_FIELDS = (
    "name",
    "bio",
    "tag",
    "avatar",
    "allow_media",
    "access_level",
)

EDITABLE_TOPIC_FIELDS = (
    "name",
    "bio",
    "tag",
    "avatar",
    "access_level",
    "allow_member_messages",
)


def build_direct_chat_key(first_user, second_user):
    """Build the stable key for a direct chat between two saved users."""
    identifiers = sorted([_user_identifier(first_user), _user_identifier(second_user)])
    return f"direct:{identifiers[0]}:{identifiers[1]}"


def get_or_create_direct_chat(current_user, target_user):
    """Return the single Pv for two users, creating it when needed.

    Returns a ``(pv, created)`` tuple. The unique ``direct_key`` constraint is
    the source of truth for idempotence, so concurrent create attempts resolve
    to the same Pv.
    """
    current_id = _user_identifier(current_user)
    target_id = _user_identifier(target_user)
    if current_id == target_id:
        raise ValueError("Cannot start a direct chat with yourself.")

    direct_key = build_direct_chat_key(current_user, target_user)
    participants = (current_user, target_user)

    try:
        with transaction.atomic():
            pv = Pv.objects.select_for_update().get(direct_key=direct_key)
            _sync_direct_memberships(pv, participants)
            return pv, False
    except Pv.DoesNotExist:
        pass

    try:
        with transaction.atomic():
            pv = Pv.objects.create(direct_key=direct_key)
            _sync_direct_memberships(pv, participants)
            return pv, True
    except IntegrityError:
        with transaction.atomic():
            pv = Pv.objects.select_for_update().get(direct_key=direct_key)
            _sync_direct_memberships(pv, participants)
            return pv, False


def create_group(owner, *, name, bio="", tag=None, avatar=None, access_level=None):
    """Create a group owned by ``owner``, who is enrolled as a member too.

    Enrolling the owner keeps membership queries and member counts honest:
    every participant is a row, and ownership is the extra role on top.
    """
    _validate_actor(owner)
    normalized_name = _validate_group_name(name)

    with transaction.atomic():
        group = Group(
            name=normalized_name,
            bio=bio or "",
            tag=tag,
            link=_issue_join_token(Group),
        )
        if avatar is not None:
            group.avatar = avatar
        if access_level is not None:
            group.access_level = access_level
        group.owner = owner
        group.save()

        GroupMembership.objects.create(group=group, user=owner)
        return group


def update_group(actor, group, changes):
    """Apply owner-only edits to a group's profile.

    ``changes`` carries only the keys the caller wants to touch, so a partial
    update never resets a field the request did not mention.
    """
    _require_group_owner(actor, group)

    unknown_fields = set(changes) - set(EDITABLE_GROUP_FIELDS)
    if unknown_fields:
        raise ValidationError(
            {field: "This field cannot be edited." for field in sorted(unknown_fields)}
        )

    if "name" in changes:
        changes = {**changes, "name": _validate_group_name(changes["name"])}

    for field, value in changes.items():
        setattr(group, field, value)

    if changes:
        group.save(update_fields=tuple(changes))
    return group


def delete_group(actor, group):
    """Soft-delete a group so its history stays intact but nobody can reach it."""
    _require_group_owner(actor, group)

    if not group.is_deleted:
        group.is_deleted = True
        group.save(update_fields=("is_deleted",))
    return group


def add_group_member(actor, group, user):
    """Add ``user`` to the group on the owner's behalf.

    Honours the target's "Allow adding me to groups" switch: without it, the
    only way in is the invite link, which the user opens themselves.
    """
    _require_group_owner(actor, group)
    _validate_actor(user, message="A valid active user is required.")

    if not user.can_be_added_to_group:
        raise PermissionDenied(
            "This user does not allow being added to groups."
        )

    membership, created = GroupMembership.objects.get_or_create(
        group=group, user=user
    )
    return membership, created


def remove_group_member(actor, group, user):
    """Remove a member. Owner-only, and the owner cannot remove themselves."""
    _require_group_owner(actor, group)

    if user is None:
        raise ValidationError({"user": "User is required."})
    if user.pk == group.owner_id:
        raise ValidationError(
            {"user": "The owner cannot be removed from their own group."}
        )

    deleted_count, _ = GroupMembership.objects.filter(group=group, user=user).delete()
    return deleted_count > 0


def join_group_via_token(user, token):
    """Join the group behind an invite token, returning ``(group, created)``.

    Opening the link is the consent, so this deliberately ignores the
    "Allow adding me to groups" switch, which only gates *other people*
    adding the user.
    """
    _validate_actor(user)

    normalized_token = (token or "").strip()
    if not normalized_token:
        raise ValidationError({"token": "Invite token is required."})

    try:
        group = Group.objects.select_related("owner", "tag").get(
            link=normalized_token, is_deleted=False
        )
    except Group.DoesNotExist:
        raise ValidationError({"token": "This invite link is not valid."})

    if is_group_member(user, group):
        return group, False

    _, created = GroupMembership.objects.get_or_create(group=group, user=user)
    return group, created


def rotate_group_invite(actor, group):
    """Issue a fresh invite token, retiring whatever the group had.

    The point of the feature is revocation: a link that leaked into the wrong
    chat has to stop working, and the only way to guarantee that is to make the
    old token match nothing.
    """
    _require_group_owner(actor, group)

    group.link = _issue_join_token(Group)
    group.save(update_fields=("link",))
    return group


# --------------------------------------------------------------------------
# Channels
#
# A channel holds no messages; it owns membership, roles, and a set of topics
# that do. Every rule below therefore asks about the *channel* even when the
# thing being changed is a topic.
# --------------------------------------------------------------------------


def create_channel(owner, *, name, bio="", tag=None, avatar=None, access_level=None):
    """Create a channel owned by ``owner``, who is enrolled as a member too."""
    _validate_actor(owner)
    normalized_name = _validate_room_name(name, label="Channel")
    _require_unique_channel_name(normalized_name)

    try:
        with transaction.atomic():
            channel = Channel(
                name=normalized_name,
                bio=bio or "",
                tag=tag,
                owner=owner,
                link=_issue_join_token(Channel),
            )
            if avatar is not None:
                channel.avatar = avatar
            if access_level is not None:
                channel.access_level = access_level
            channel.save()

            ChannelMembership.objects.create(
                channel=channel, user=owner, is_admin=True
            )
            return channel
    except IntegrityError:
        # The unique index is the real arbiter; two people naming a channel the
        # same thing at the same moment only lose the race here.
        raise ValidationError({"name": "A channel with this name already exists."})


def update_channel(actor, channel, changes):
    """Apply an admin's edits to a channel's profile."""
    _require_channel_admin(actor, channel)

    unknown_fields = set(changes) - set(EDITABLE_CHANNEL_FIELDS)
    if unknown_fields:
        raise ValidationError(
            {field: "This field cannot be edited." for field in sorted(unknown_fields)}
        )

    if "name" in changes:
        normalized_name = _validate_room_name(changes["name"], label="Channel")
        _require_unique_channel_name(normalized_name, exclude_pk=channel.pk)
        changes = {**changes, "name": normalized_name}

    for field, value in changes.items():
        setattr(channel, field, value)

    if changes:
        try:
            channel.save(update_fields=tuple(changes))
        except IntegrityError:
            raise ValidationError(
                {"name": "A channel with this name already exists."}
            )
    return channel


def delete_channel(actor, channel):
    """Soft-delete a channel and everything under it.

    Topics are marked deleted too rather than left dangling: they are reachable
    by their own chat id, and a topic whose channel is gone has nobody left who
    can moderate it.
    """
    _require_channel_owner(actor, channel)

    with transaction.atomic():
        if not channel.is_deleted:
            channel.is_deleted = True
            channel.save(update_fields=("is_deleted",))
        Topic.objects.filter(channel=channel, is_deleted=False).update(
            is_deleted=True
        )
    return channel


def rotate_channel_invite(actor, channel):
    """Issue a fresh invite token, retiring whatever the channel had."""
    _require_channel_admin(actor, channel)

    channel.link = _issue_join_token(Channel)
    channel.save(update_fields=("link",))
    return channel


def add_channel_member(actor, channel, user):
    """Add ``user`` to the channel on an admin's behalf.

    Honours the target's "Allow adding me to channels" switch: without it, the
    only ways in are the invite link and — for a public channel — joining of
    their own accord, both of which the user does themselves.
    """
    _require_channel_admin(actor, channel)
    _validate_actor(user, message="A valid active user is required.")

    if not user.can_be_added_to_channel:
        raise PermissionDenied("This user does not allow being added to channels.")

    membership, created = ChannelMembership.objects.get_or_create(
        channel=channel, user=user
    )
    return membership, created


def remove_channel_member(actor, channel, user):
    """Remove a member. Admins may remove members; only the owner may remove
    another admin, so two admins cannot fight over the door."""
    _require_channel_admin(actor, channel)

    if user is None:
        raise ValidationError({"user": "User is required."})
    if user.pk == channel.owner_id:
        raise ValidationError(
            {"user": "The owner cannot be removed from their own channel."}
        )

    membership = ChannelMembership.objects.filter(channel=channel, user=user).first()
    if membership is None:
        return False

    if membership.is_admin and not is_channel_owner(actor, channel):
        raise PermissionDenied("Only the owner can remove another admin.")

    membership.delete()
    return True


def set_channel_admin(actor, channel, user, is_admin):
    """Promote or demote a member. Owner-only, and never the owner themselves.

    The owner's powers come from `Channel.owner`, not from a membership flag,
    so toggling it would be a no-op that reads like it did something.
    """
    _require_channel_owner(actor, channel)

    if user is None:
        raise ValidationError({"user": "User is required."})
    if user.pk == channel.owner_id:
        raise ValidationError(
            {"user": "The owner already has every admin permission."}
        )

    membership = ChannelMembership.objects.filter(channel=channel, user=user).first()
    if membership is None:
        raise ValidationError({"user": "This user is not a member of the channel."})

    if membership.is_admin != is_admin:
        membership.is_admin = is_admin
        membership.save(update_fields=("is_admin",))
    return membership


def join_channel_via_token(user, token):
    """Join the channel behind an invite token, returning ``(channel, created)``.

    Opening the link is the consent, so this deliberately ignores the "Allow
    adding me to channels" switch, which only gates *other people* adding the
    user.
    """
    _validate_actor(user)

    normalized_token = (token or "").strip()
    if not normalized_token:
        raise ValidationError({"token": "Invite token is required."})

    try:
        channel = Channel.objects.select_related("owner", "tag").get(
            link=normalized_token, is_deleted=False
        )
    except Channel.DoesNotExist:
        raise ValidationError({"token": "This invite link is not valid."})

    if is_channel_member(user, channel):
        return channel, False

    _, created = ChannelMembership.objects.get_or_create(channel=channel, user=user)
    return channel, created


def join_public_channel(user, channel):
    """Join a public channel of one's own accord.

    A private channel is deliberately not joinable this way — being able to see
    that it exists (as a member of another channel might, through a shared
    link) is not the same as being allowed in.
    """
    _validate_actor(user)

    if channel is None or channel.is_deleted:
        raise ValidationError({"channel": "This channel is not available."})
    if channel.access_level != AccessLevel.PUBLIC:
        raise PermissionDenied("This channel is private. You need an invite.")

    if is_channel_member(user, channel):
        return channel, False

    _, created = ChannelMembership.objects.get_or_create(channel=channel, user=user)
    return channel, created


# --------------------------------------------------------------------------
# Topics
# --------------------------------------------------------------------------


def create_topic(
    actor,
    channel,
    *,
    name,
    bio="",
    tag=None,
    avatar=None,
    access_level=None,
    allow_member_messages=None,
):
    """Add a topic to a channel. Admins only."""
    _require_channel_admin(actor, channel)
    normalized_name = _validate_room_name(name, label="Topic")

    with transaction.atomic():
        topic = Topic(
            name=normalized_name,
            bio=bio or "",
            tag=tag,
            channel=channel,
        )
        if avatar is not None:
            topic.avatar = avatar
        if access_level is not None:
            topic.access_level = access_level
        if allow_member_messages is not None:
            topic.allow_member_messages = allow_member_messages
        topic.save()
        return topic


def update_topic(actor, topic, changes):
    """Apply an admin's edits to a topic, including its posting lock."""
    _require_channel_admin(actor, topic.channel)

    unknown_fields = set(changes) - set(EDITABLE_TOPIC_FIELDS)
    if unknown_fields:
        raise ValidationError(
            {field: "This field cannot be edited." for field in sorted(unknown_fields)}
        )

    if "name" in changes:
        changes = {**changes, "name": _validate_room_name(changes["name"], label="Topic")}

    for field, value in changes.items():
        setattr(topic, field, value)

    if changes:
        topic.save(update_fields=tuple(changes))
    return topic


def delete_topic(actor, topic):
    """Soft-delete a topic so its history stays intact but nobody can reach it."""
    _require_channel_admin(actor, topic.channel)

    if not topic.is_deleted:
        topic.is_deleted = True
        topic.save(update_fields=("is_deleted",))
    return topic


def _require_unique_channel_name(name, *, exclude_pk=None):
    """Reject a name a live channel already holds, ignoring case.

    Checked here as well as in the database so the caller gets a field error
    instead of an integrity error; the unique index remains the real guard.
    """
    existing = Channel.objects.filter(is_deleted=False).filter(
        Q(name__iexact=name)
    )
    if exclude_pk is not None:
        existing = existing.exclude(pk=exclude_pk)
    if existing.exists():
        raise ValidationError({"name": "A channel with this name already exists."})


def _require_channel_owner(actor, channel):
    _validate_actor(actor)
    if channel is None:
        raise ValidationError({"channel": "Channel is required."})
    if not is_channel_owner(actor, channel):
        raise PermissionDenied("Only the channel owner can do this.")


def _require_channel_admin(actor, channel):
    _validate_actor(actor)
    if channel is None:
        raise ValidationError({"channel": "Channel is required."})
    if not is_channel_admin(actor, channel):
        raise PermissionDenied("Only channel admins can do this.")


def _validate_room_name(name, *, label):
    normalized_name = (name or "").strip()
    if not normalized_name:
        raise ValidationError({"name": f"{label} name is required."})
    if len(normalized_name) > 255:
        raise ValidationError(
            {"name": f"{label} name must be at most 255 characters."}
        )
    return normalized_name


def _issue_join_token(model):
    """Return a token no existing row of ``model`` holds.

    The unique constraint is still the real guard; this only avoids losing a
    whole create transaction to an avoidable collision.
    """
    for _ in range(_JOIN_TOKEN_ATTEMPTS):
        token = token_urlsafe(JOIN_TOKEN_BYTES)
        if not model.objects.filter(link=token).exists():
            return token
    raise ValidationError({"link": "Could not allocate an invite link."})


def _validate_group_name(name):
    normalized_name = (name or "").strip()
    if not normalized_name:
        raise ValidationError({"name": "Group name is required."})
    if len(normalized_name) > 255:
        raise ValidationError({"name": "Group name must be at most 255 characters."})
    return normalized_name


def _require_group_owner(actor, group):
    _validate_actor(actor)
    if group is None:
        raise ValidationError({"group": "Group is required."})
    if not is_group_owner(actor, group):
        raise PermissionDenied("Only the group owner can do this.")


def _validate_actor(user, message="A valid active user is required."):
    if not (
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    ):
        raise PermissionDenied(message)


def _user_identifier(user):
    if user is None or user.pk in (None, ""):
        raise ValueError("Direct chat users must be saved.")
    return str(user.pk)


def _sync_direct_memberships(pv, users):
    user_ids = [user.pk for user in users]
    PvMembership.objects.filter(pv=pv).exclude(user_id__in=user_ids).delete()
    PvMembership.objects.bulk_create(
        [PvMembership(pv=pv, user=user) for user in users],
        ignore_conflicts=True,
    )
