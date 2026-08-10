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
