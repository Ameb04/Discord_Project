"""Who has asked not to be notified, and the reads that answer it.

Muting is per person: the same chat is loud for one member and silent for
another, so every question here is asked about a (user, conversation) pair.
"""

from django.core.exceptions import ObjectDoesNotExist, PermissionDenied

from chats.permissions import can_access_chat, is_channel_member

from .models import ChannelMute, ChatMute


def channel_of(chat):
    """Return the channel a chat belongs to, or None when it is not a topic."""
    try:
        topic = chat.topic
    except ObjectDoesNotExist:
        return None
    return topic.channel


def muted_chat_ids(user):
    """Every chat this user has silenced, as a set of chat ids."""
    if not _is_active_user(user):
        return set()
    return set(
        ChatMute.objects.filter(user=user).values_list("chat_id", flat=True)
    )


def muted_channel_ids(user):
    """Every channel this user has silenced, as a set of channel ids."""
    if not _is_active_user(user):
        return set()
    return set(
        ChannelMute.objects.filter(user=user).values_list("channel_id", flat=True)
    )


def set_chat_mute(user, chat, muted):
    """Silence or unsilence one chat for one person.

    Access is required: muting is a preference about a conversation you are in,
    and letting a stranger write rows against any chat id would leak which ones
    exist. Returns the resulting state, so a repeated call is a no-op rather
    than an error.
    """
    if not can_access_chat(user, chat):
        raise PermissionDenied("You do not have permission to access this chat.")

    if muted:
        ChatMute.objects.get_or_create(chat=chat, user=user)
    else:
        ChatMute.objects.filter(chat=chat, user=user).delete()

    return muted


def set_channel_mute(user, channel, muted):
    """Silence or unsilence every topic in one channel for one person."""
    if not is_channel_member(user, channel):
        raise PermissionDenied("You are not a member of this channel.")

    if muted:
        ChannelMute.objects.get_or_create(channel=channel, user=user)
    else:
        ChannelMute.objects.filter(channel=channel, user=user).delete()

    return muted


def is_chat_muted(user, chat):
    """Whether this person has silenced this chat, directly or via its channel."""
    if not _is_active_user(user):
        return False

    if ChatMute.objects.filter(chat=chat, user=user).exists():
        return True

    channel = channel_of(chat)
    if channel is None:
        return False
    return ChannelMute.objects.filter(channel=channel, user=user).exists()


def is_channel_muted(user, channel):
    """Whether this person has silenced this channel as a whole."""
    if not _is_active_user(user):
        return False
    return ChannelMute.objects.filter(channel=channel, user=user).exists()


def unmuted_user_ids(chat, candidate_ids):
    """Narrow ``candidate_ids`` to the people this chat may still notify.

    Two queries regardless of how many candidates there are, because a busy
    group would otherwise ask the same question once per member on every
    single message.
    """
    if not candidate_ids:
        return []

    silenced = set(
        ChatMute.objects.filter(chat=chat, user_id__in=candidate_ids).values_list(
            "user_id", flat=True
        )
    )

    channel = channel_of(chat)
    if channel is not None:
        silenced.update(
            ChannelMute.objects.filter(
                channel=channel, user_id__in=candidate_ids
            ).values_list("user_id", flat=True)
        )

    return [user_id for user_id in candidate_ids if user_id not in silenced]


def _is_active_user(user):
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    )
