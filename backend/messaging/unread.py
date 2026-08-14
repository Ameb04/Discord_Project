"""How much of a conversation one person has not caught up on.

Everything here is derived from ``ChatReadState``'s watermark rather than
stored: an unread *count* that is written down is a number that can drift from
the messages it claims to describe, and there is no repair path once it does.
Counting from the watermark cannot drift, because the watermark is the only
thing being remembered.
"""

import operator
from functools import reduce

from django.db.models import Count, Min, Q

from .models import ChatReadState, NormalMessage


def unread_summaries(user, chat_ids):
    """Unread state for many chats at once, keyed by chat id.

    Two queries whatever the number of chats: one for the watermarks, one
    grouped over the messages past them. The sidebar asks this about every
    conversation at once, so a per-chat query would put the whole inbox's
    length into the endpoint's cost.

    Chats that are fully caught up are absent from the result rather than
    present with a zero — callers read it with a default, and shipping rows of
    nothing is just noise.
    """
    chat_ids = list(chat_ids)
    if not chat_ids or not _is_active_user(user):
        return {}

    watermarks = dict(
        ChatReadState.objects.filter(user=user, chat_id__in=chat_ids).values_list(
            "chat_id", "last_read_message_id"
        )
    )

    # A chat never opened has no row, and no row means nothing has been read.
    unread_in_any_chat = reduce(
        operator.or_,
        (
            Q(chat_id=chat_id, pk__gt=watermarks.get(chat_id, 0))
            for chat_id in chat_ids
        ),
    )

    rows = (
        NormalMessage.objects.filter(unread_in_any_chat, is_deleted=False)
        # Your own messages are never unread to you. Written as an explicit
        # OR rather than `.exclude(sender_id=...)`: the sender is nullable, and
        # SQL's three-valued logic quietly drops NULL rows from a negation —
        # which would stop messages from deleted accounts ever being counted.
        .filter(Q(sender__isnull=True) | ~Q(sender_id=user.pk))
        .values("chat_id")
        .annotate(unread_count=Count("pk"), first_unread_message_id=Min("pk"))
    )

    return {
        row["chat_id"]: {
            "unread_count": row["unread_count"],
            "first_unread_message_id": row["first_unread_message_id"],
        }
        for row in rows
    }


def unread_summary(user, chat):
    """The same for a single chat, always as a filled-in pair."""
    summary = unread_summaries(user, [chat.pk]).get(chat.pk)
    if summary is None:
        return {"unread_count": 0, "first_unread_message_id": None}
    return summary


def _is_active_user(user):
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    )
