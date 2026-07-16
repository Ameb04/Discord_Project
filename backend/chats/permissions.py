from django.core.exceptions import ObjectDoesNotExist

from .models import AccessLevel, ChannelMembership, GroupMembership, PvMembership


def can_access_chat(user, chat):
    """Return whether user may view/read an existing chat."""
    if not _is_active_user(user) or chat is None or chat.is_deleted:
        return False

    pv = _related(chat, "pv")
    if pv is not None:
        return PvMembership.objects.filter(pv=pv, user=user).exists()

    group = _related(chat, "group")
    if group is not None:
        return group.owner_id == user.pk or GroupMembership.objects.filter(
            group=group, user=user
        ).exists()

    topic = _related(chat, "topic")
    if topic is not None:
        channel = topic.channel
        if channel.is_deleted:
            return False

        is_channel_member = _is_channel_member_or_owner(user, channel)
        if channel.is_private or topic.access_level == AccessLevel.PRIVATE:
            return is_channel_member

        return True

    return False


def can_send_to_chat(user, chat):
    """Return whether user may send in a chat.

    The current models do not define a separate read/write permission, muted
    members, blocked users, or topic moderation. Until those product rules
    exist in the schema, sending follows the same membership/privacy rules as
    access.
    """
    return can_access_chat(user, chat)


def _is_active_user(user):
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    )


def _related(chat, related_name):
    try:
        return getattr(chat, related_name)
    except ObjectDoesNotExist:
        return None


def _is_channel_member_or_owner(user, channel):
    return channel.owner_id == user.pk or ChannelMembership.objects.filter(
        channel=channel, user=user
    ).exists()
