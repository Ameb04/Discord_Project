from secrets import token_urlsafe

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction

from .models import Group, GroupMembership, Pv, PvMembership
from .permissions import is_group_member, is_group_owner

JOIN_TOKEN_BYTES = 16
_JOIN_TOKEN_ATTEMPTS = 5

# Fields the owner may change after creation. `link` is deliberately absent:
# the invite token is server-issued so an owner cannot squat a guessable one.
EDITABLE_GROUP_FIELDS = ("name", "bio", "tag", "avatar", "allow_media", "access_level")


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
            link=_issue_join_token(),
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


def _issue_join_token():
    """Return a token no existing group holds.

    The unique constraint is still the real guard; this only avoids losing a
    whole create transaction to an avoidable collision.
    """
    for _ in range(_JOIN_TOKEN_ATTEMPTS):
        token = token_urlsafe(JOIN_TOKEN_BYTES)
        if not Group.objects.filter(link=token).exists():
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
