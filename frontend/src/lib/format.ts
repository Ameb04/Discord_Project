/** Presentation helpers shared across chat surfaces. */

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;

/** "820 B" / "12.4 KB" / "3.1 MB" — one decimal, never more. */
export function formatFileSize(size: number | null | undefined) {
  if (size == null) return "";
  if (size < KILOBYTE) return `${size} B`;
  if (size < MEGABYTE) return `${(size / KILOBYTE).toFixed(1)} KB`;
  return `${(size / MEGABYTE).toFixed(1)} MB`;
}

const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Absolute timestamp for a message bubble; empty string for unparseable input. */
export function formatMessageTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return messageTimeFormatter.format(date);
}

/** "Ada Lovelace", falling back to the phone number when a name is missing. */
export function personDisplayName(
  person: {
    first_name?: string | null;
    last_name?: string | null;
    phone_number?: string | null;
  } | null,
  fallback = "Unknown user"
) {
  if (!person) return fallback;
  const fullName = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  return fullName || person.phone_number || fallback;
}

/** Up to two uppercase initials for an avatar fallback. */
export function initialsFor(name: string, fallback = "?") {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return initials || fallback;
}
