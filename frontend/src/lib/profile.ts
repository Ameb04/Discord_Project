/** Profile constants shared by the user and group forms. */

/**
 * Bios are one line about yourself (or the group), not a profile page.
 *
 * Mirrors `accounts.models.BIO_MAX_LENGTH`; the server enforces it, this keeps
 * the field from letting anyone type past a rejection.
 */
export const BIO_MAX_LENGTH = 70;

/** How close to the ceiling before the counter starts warning. */
export const BIO_WARN_REMAINING = 10;

/**
 * A room's name — group, channel or topic — has to survive a 24rem sidebar
 * row, a chat header, and a dialog title without becoming an ellipsis in every
 * one of them.
 *
 * Mirrors the `*_NAME_MAX_LENGTH` constants in `chats.serializers`; the column
 * itself is far wider, so this is a product limit rather than a storage one —
 * enforced on the server, and mirrored here so typing stops at the ceiling
 * instead of running into a rejection on submit.
 */
export const ROOM_NAME_MAX_LENGTH = 30;

/** How close to the ceiling before the name counter starts warning. */
export const ROOM_NAME_WARN_REMAINING = 5;
