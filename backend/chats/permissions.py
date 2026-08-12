from django.core.exceptions import ObjectDoesNotExist

from .models import (
    AccessLevel,
    ChannelMembership,
    Group,
    GroupMembership,
    Pv,
    PvMembership,
    Topic,
)

# Chat subclasses, keyed by the reverse accessor that reaches them from Chat.
_CHAT_SUBCLASSES = {"pv": Pv, "group": Group, "topic": Topic}


def can_access_chat(user, chat):
    """Return whether user may view/read an existing chat."""
    if not _is_active_user(user) or chat is None or chat.is_deleted:
        return False

    pv = _related(chat, "pv")
    if pv is not None:
        return PvMembership.objects.filter(pv=pv, user=user).exists()

    group = _related(chat, "group")
    if group is not None:
        return is_group_member(user, group)

    topic = _related(chat, "topic")
    if topic is not None:
        channel = topic.channel
        if channel.is_deleted:
            return False
        # Reading a topic means being in the channel, public or not. A public
        # channel is *discoverable* — its name, bio and topic list are shown to
        # anyone so they can decide to join — but the conversation inside it is
        # still for members.
        return is_channel_member(user, channel)

    return False


def can_send_to_chat(user, chat):
    """Return whether user may send in a chat.

    Direct chats and groups have no separate write rule — being in the room is
    permission to speak. A topic does: its channel's admins can close it to
    everyone else and reopen it later, and are never silenced by their own
    switch.
    """
    if not can_access_chat(user, chat):
        return False

    topic = _related(chat, "topic")
    if topic is not None:
        return topic.allow_member_messages or is_channel_admin(user, topic.channel)

    return True


def can_send_media_to_chat(user, chat):
    """Return whether user may attach a file in a chat.

    Groups and channels both start with media disabled; only the people who run
    them can lift that, and they are never blocked by their own switch.
    """
    if not can_send_to_chat(user, chat):
        return False

    group = _related(chat, "group")
    if group is not None:
        return group.allow_media or is_group_owner(user, group)

    topic = _related(chat, "topic")
    if topic is not None:
        channel = topic.channel
        return channel.allow_media or is_channel_admin(user, channel)

    return True


def can_delete_message(user, message):
    """Return whether user may delete an existing message.

    Everyone may delete what they sent. A group owner, and a channel's owner or
    admins, may additionally delete anyone's message in their own room —
    moderation only, never editing, which stays with the author.
    """
    if not _is_active_user(user) or message is None or message.is_deleted:
        return False

    chat = message.chat
    if not can_access_chat(user, chat):
        return False

    if message.sender_id == user.pk:
        return True

    group = _related(chat, "group")
    if group is not None:
        return is_group_owner(user, group)

    topic = _related(chat, "topic")
    if topic is not None:
        return is_channel_admin(user, topic.channel)

    return False


def chat_member_ids(chat):
    """Return the ids of everyone who participates in this chat.

    Owners are folded in explicitly: they hold their role through the owning
    foreign key, and older rooms may predate the rule that enrols them as a
    membership row too.
    """
    if chat is None:
        return []

    pv = _related(chat, "pv")
    if pv is not None:
        return list(
            PvMembership.objects.filter(pv=pv).values_list("user_id", flat=True)
        )

    group = _related(chat, "group")
    if group is not None:
        member_ids = set(
            GroupMembership.objects.filter(group=group).values_list(
                "user_id", flat=True
            )
        )
        member_ids.add(group.owner_id)
        return list(member_ids)

    topic = _related(chat, "topic")
    if topic is not None:
        member_ids = set(
            ChannelMembership.objects.filter(channel=topic.channel).values_list(
                "user_id", flat=True
            )
        )
        member_ids.add(topic.channel.owner_id)
        return list(member_ids)

    return []


def is_group_owner(user, group):
    """Return whether user owns the group — the only role that may manage it."""
    return _is_active_user(user) and group is not None and group.owner_id == user.pk


def is_group_member(user, group):
    """Return whether user is in the group, counting the owner as a member."""
    if not _is_active_user(user) or group is None:
        return False
    return group.owner_id == user.pk or GroupMembership.objects.filter(
        group=group, user=user
    ).exists()


def is_channel_owner(user, channel):
    """Return whether user created the channel.

    The one role that can promote admins, or delete the channel outright.
    """
    return _is_active_user(user) and channel is not None and channel.owner_id == user.pk


def is_channel_admin(user, channel):
    """Return whether user helps run the channel.

    True for the owner too: every question this answers — may they add members,
    manage topics, moderate messages — the owner may also do, and spelling that
    out at every call site is how one of them ends up forgotten.
    """
    if not _is_active_user(user) or channel is None:
        return False
    if channel.owner_id == user.pk:
        return True
    return ChannelMembership.objects.filter(
        channel=channel, user=user, is_admin=True
    ).exists()


def is_channel_member(user, channel):
    """Return whether user is in the channel, counting the owner as a member."""
    if not _is_active_user(user) or channel is None:
        return False
    return channel.owner_id == user.pk or ChannelMembership.objects.filter(
        channel=channel, user=user
    ).exists()


def can_discover_channel(user, channel):
    """Return whether user may see that this channel exists.

    Members always can. Everyone else can only see public channels — which is
    the whole point of the public/private split: a private channel should not
    even be listable by a stranger who guessed its name.
    """
    if channel is None or channel.is_deleted:
        return False
    if channel.access_level == AccessLevel.PUBLIC:
        return True
    return is_channel_member(user, channel)


def _is_active_user(user):
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    )


def _related(chat, related_name):
    """Return the chat's subclass row for ``related_name``, or None.

    When the caller already holds the subclass instance, it is returned as-is.
    That saves a query, and — more importantly — avoids Django's cached reverse
    relation handing back a copy loaded *before* the caller's own edit, which
    would silently answer permission questions from pre-edit state.
    """
    subclass = _CHAT_SUBCLASSES[related_name]
    if isinstance(chat, subclass):
        return chat

    try:
        return getattr(chat, related_name)
    except ObjectDoesNotExist:
        return None
