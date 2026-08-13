/**
 * Local-time helpers for picking and describing a future moment.
 *
 * Everything here works in the viewer's own timezone — the API speaks ISO-8601
 * with an offset, so the conversion happens only at the boundary.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const MINUTES_PER_DAY = 24 * 60;

export function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function startOfMonth(date: Date) {
  const result = startOfDay(date);
  result.setDate(1);
  return result;
}

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number) {
  const result = startOfMonth(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Minutes elapsed since local midnight — the unit the time picker edits. */
export function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function atMinutes(day: Date, minutes: number) {
  const result = startOfDay(day);
  result.setMinutes(minutes);
  return result;
}

/** Round forward to the next whole `step` minutes, so defaults land on :00/:05. */
export function ceilToMinutes(date: Date, step: number) {
  const result = new Date(date);
  result.setSeconds(0, 0);
  const remainder = result.getMinutes() % step;
  if (remainder !== 0) result.setMinutes(result.getMinutes() + (step - remainder));
  return result;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const weekdayDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const monthTitleFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

const weekdayNarrowFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

/** True when the viewer's locale renders clock times as 12-hour with AM/PM. */
export const usesTwelveHourClock =
  timeFormatter.resolvedOptions().hour12 ?? false;

export const localTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone ?? "your local time";

export const formatTime = (date: Date) => timeFormatter.format(date);
export const formatMonthTitle = (date: Date) => monthTitleFormatter.format(date);
export const formatShortDate = (date: Date) => shortDateFormatter.format(date);

/** "Today" / "Tomorrow" / "Thu, 21 Aug", relative to `now`. */
export function formatDayLabel(date: Date, now = new Date()) {
  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, addDays(now, 1))) return "Tomorrow";
  return shortDateFormatter.format(date);
}

/** "Today at 9:00 AM" / "Thursday, 21 August at 9:00 AM". */
export function formatDeliveryMoment(date: Date, now = new Date()) {
  const time = timeFormatter.format(date);
  if (isSameDay(date, now)) return `Today at ${time}`;
  if (isSameDay(date, addDays(now, 1))) return `Tomorrow at ${time}`;
  return `${weekdayDateFormatter.format(date)} at ${time}`;
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * DAY_MS],
  ["month", 30 * DAY_MS],
  ["week", 7 * DAY_MS],
  ["day", DAY_MS],
  ["hour", HOUR_MS],
  ["minute", MINUTE_MS],
];

/** "in 3 hours" / "2 days ago" / "in under a minute". */
export function formatRelativeToNow(date: Date, now = new Date()) {
  const deltaMs = date.getTime() - now.getTime();

  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= unitMs) {
      return relativeFormatter.format(Math.round(deltaMs / unitMs), unit);
    }
  }
  return deltaMs >= 0 ? "in under a minute" : "just now";
}

/** Localised weekday headers for a calendar grid, Sunday first. */
export function weekdayHeadings() {
  // 2024-01-07 was a Sunday; any known Sunday works as the anchor.
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, index) => ({
    key: index,
    label: weekdayNarrowFormatter.format(addDays(sunday, index)),
  }));
}

// ---------------------------------------------------------------------------
// Quick presets
// ---------------------------------------------------------------------------

export type SchedulePreset = {
  id: string;
  label: string;
  at: Date;
};

function atClock(day: Date, hours: number, minutes = 0) {
  return atMinutes(day, hours * 60 + minutes);
}

/** Drop sub-minute precision — the picker only ever shows whole minutes. */
function atWholeMinute(timestamp: number) {
  const result = new Date(timestamp);
  result.setSeconds(0, 0);
  return result;
}

/**
 * The handful of times people actually pick, so the common case never needs the
 * calendar. Anything already in the past is dropped rather than shown disabled.
 */
export function buildSchedulePresets(now = new Date()): SchedulePreset[] {
  const tonight = atClock(now, 20);
  const tomorrowMorning = atClock(addDays(now, 1), 9);
  // Monday of the week after this one (2-8 days out), so it never collapses
  // into the "tomorrow" preset above.
  const nextMonday = atClock(addDays(now, 8 - now.getDay()), 9);

  const candidates: SchedulePreset[] = [
    {
      id: "in-30-minutes",
      label: "In 30 minutes",
      at: atWholeMinute(now.getTime() + 30 * MINUTE_MS),
    },
    {
      id: "in-1-hour",
      label: "In 1 hour",
      at: atWholeMinute(now.getTime() + HOUR_MS),
    },
    { id: "tonight", label: `Tonight, ${formatTime(tonight)}`, at: tonight },
    {
      id: "tomorrow-morning",
      label: `Tomorrow, ${formatTime(tomorrowMorning)}`,
      at: tomorrowMorning,
    },
    {
      id: "next-monday",
      label: `Next Monday, ${formatTime(nextMonday)}`,
      at: nextMonday,
    },
  ];

  return candidates.filter((preset) => preset.at.getTime() > now.getTime());
}
