"""What a new message looks like to someone who is not reading it yet.

The chat socket in ``realtime`` answers "what happened in the room I have
open". This module answers the other half: telling the people who are *not* in
that room that something arrived. The two are deliberately separate — one is
scoped to a conversation, the other to a person, and a notification carries the
name of the room precisely because its reader is somewhere else.
"""

import hashlib

from django.core.exceptions import ObjectDoesNotExist

from accounts.serializers import PublicUserSerializer
from chats.permissions import chat_member_ids

from .mutes import unmuted_user_ids

# A notification is a glance, not a read. Anything longer is an ellipsis in a
# toast that is about to disappear anyway.
PREVIEW_MAX_LENGTH = 120


def user_notification_group_name(user_id):
    """The channel-layer group carrying one person's notifications.

    The id is hashed rather than interpolated. A user id here is a phone
    number, and channel-layer group names admit only ``[a-zA-Z0-9._-]`` — so a
    perfectly ordinary ``+98…`` number makes an illegal group name, and
    ``group_send`` raises. Because the fan-out runs inside an ``on_commit``
    callback, that exception is swallowed and logged rather than surfaced: the
    chat broadcast in front of it still lands, so the failure looks like
    "notifications just don't work" with nothing obviously broken.

    Trimming the offending characters instead would fold ``+98…`` and ``098…``
    onto the same group and deliver one person's messages to another. A digest
    is unconditionally in the allowed alphabet, fixed length, and collision-free
    in any sense that matters here.
    """
    digest = hashlib.sha256(str(user_id).encode("utf-8")).hexdigest()
    return f"notifications_{digest[:32]}"


def notification_recipient_ids(message):
    """Who hears about ``message`` at all, and which of them may be interrupted.

    Everyone in the chat except the sender is told — muting does not stop a
    message counting as unread, and a muted room whose badge never moved would
    look like a room nobody had written in. What muting decides is only whether
    that news is allowed to raise a toast, which travels with each event as
    ``notify`` rather than by withholding the event.

    Returns ``(recipient_ids, notifiable_ids)``, the second a subset of the
    first.
    """
    recipient_ids = [
        member_id
        for member_id in chat_member_ids(message.chat)
        if member_id != message.sender_id
    ]
    return recipient_ids, set(unmuted_user_ids(message.chat, recipient_ids))


def describe_conversation(chat, sender):
    """Name the room a notification came from, as its reader would name it.

    A direct chat has no name of its own — to the person being notified it *is*
    the sender — so the sender's name stands in. A topic carries its channel
    alongside it, because "general" means nothing without the channel it is in.
    """
    try:
        topic = chat.topic
    except ObjectDoesNotExist:
        topic = None
    if topic is not None:
        return {
            "id": chat.pk,
            "type": "topic",
            "title": topic.name or f"Topic #{chat.pk}",
            "channel": topic.channel.name,
        }

    try:
        group = chat.group
    except ObjectDoesNotExist:
        group = None
    if group is not None:
        return {
            "id": chat.pk,
            "type": "group",
            "title": group.name or f"Group #{chat.pk}",
            "channel": "",
        }

    try:
        direct_chat = chat.pv
    except ObjectDoesNotExist:
        direct_chat = None
    if direct_chat is not None:
        return {
            "id": chat.pk,
            "type": "direct",
            "title": _person_display_name(sender) or "Direct message",
            "channel": "",
        }

    return {
        "id": chat.pk,
        "type": "chat",
        "title": chat.name or f"Chat #{chat.pk}",
        "channel": "",
    }


def build_notification(message):
    """The payload every recipient of ``message`` receives.

    Built once rather than per person: the only part that could differ by
    reader is a direct chat's title, and there the sender *is* the other party
    for everyone who gets this.
    """
    return {
        "chat": message.chat_id,
        "message_id": message.pk,
        "conversation": describe_conversation(message.chat, message.sender),
        "sender": (
            PublicUserSerializer(message.sender).data
            if message.sender is not None
            else None
        ),
        "preview": message_preview(message),
        "sent_at": message.sent_at.isoformat(),
    }


def message_preview(message):
    """One line standing in for the message body."""
    content = (message.content or "").strip()
    if content:
        if len(content) <= PREVIEW_MAX_LENGTH:
            return content
        return f"{content[:PREVIEW_MAX_LENGTH - 3].rstrip()}..."

    if message.file_id is not None:
        return message.file.name or "Attachment"

    return "(empty message)"


def _person_display_name(user):
    if user is None:
        return ""
    full_name = f"{user.first_name} {user.last_name}".strip()
    return full_name or user.phone_number
