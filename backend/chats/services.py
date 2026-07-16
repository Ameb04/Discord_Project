from django.db import IntegrityError, transaction

from .models import Pv, PvMembership


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
