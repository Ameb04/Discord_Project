import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { MINUTES_PER_DAY, usesTwelveHourClock } from "@/lib/datetime";

type TimeFieldProps = {
  /** Minutes since local midnight. */
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Keep a value inside `[0, size)`, wrapping in both directions. */
const wrap = (value: number, size: number) => ((value % size) + size) % size;

type SegmentProps = {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  onStep: (delta: number) => void;
};

/**
 * One editable number box (hour or minute) with its own stepper.
 *
 * While the box has focus it shows a raw typing buffer rather than the
 * formatted value, so clearing the field to type "07" does not fight a control
 * that re-pads itself between keystrokes. The buffer is dropped on blur, which
 * also means a value arriving from outside (a quick preset) shows up
 * immediately whenever the user is not mid-edit.
 */
function TimeSegment({
  label,
  value,
  max,
  disabled,
  onCommit,
  onStep,
}: SegmentProps) {
  const [buffer, setBuffer] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
    setBuffer(digits);
    if (digits === "") return;
    const parsed = Number(digits);
    if (parsed <= max) onCommit(parsed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setBuffer(null);
    onStep(event.key === "ArrowUp" ? 1 : -1);
  }

  return (
    <div className="flex items-stretch">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        value={buffer ?? pad(value)}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={(event) => event.target.select()}
        onBlur={() => setBuffer(null)}
        className="h-10 w-12 rounded-l-xl border border-r-0 border-input bg-white/[0.04] text-center text-sm font-medium tabular-nums text-foreground outline-none transition focus-visible:border-ring focus-visible:bg-white/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex flex-col">
        {[1, -1].map((delta) => (
          <button
            key={delta}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`${delta > 0 ? "Increase" : "Decrease"} ${label.toLowerCase()}`}
            onClick={() => {
              setBuffer(null);
              onStep(delta);
            }}
            className={cn(
              "grid h-5 w-6 place-items-center border border-input text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
              delta > 0 ? "rounded-tr-xl border-b-0" : "rounded-br-xl"
            )}
          >
            {delta > 0 ? (
              <ChevronUp className="size-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Hour / minute editor over a single "minutes since midnight" value.
 *
 * Every minute of the day is reachable: type it, or hold an arrow key. An
 * earlier version offered a dropdown of five-minute steps, which made "20:07"
 * simply unselectable — a scheduling control that cannot express the time the
 * user wants is not a scheduling control.
 */
function TimeField({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: TimeFieldProps) {
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const isAfternoon = hour24 >= 12;
  const displayHour = usesTwelveHourClock ? hour24 % 12 || 12 : hour24;

  const commit = (nextHour24: number, nextMinute: number) =>
    onChange(wrap(nextHour24 * 60 + nextMinute, MINUTES_PER_DAY));

  /** Map a typed 12-hour reading back onto the 24-hour clock. */
  const toHour24 = (typed: number) =>
    usesTwelveHourClock ? (typed % 12) + (isAfternoon ? 12 : 0) : wrap(typed, 24);

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="group"
      aria-label={ariaLabel ?? "Delivery time"}
    >
      <TimeSegment
        label="Hour"
        value={displayHour}
        max={usesTwelveHourClock ? 12 : 23}
        disabled={disabled}
        onCommit={(typed) => commit(toHour24(typed), minute)}
        onStep={(delta) => commit(wrap(hour24 + delta, 24), minute)}
      />

      <span aria-hidden="true" className="px-0.5 text-muted-foreground">
        :
      </span>

      <TimeSegment
        label="Minute"
        value={minute}
        max={59}
        disabled={disabled}
        onCommit={(typed) => commit(hour24, typed)}
        // Stepping past the hour boundary should roll the hour, not the minute
        // alone — so step the whole value rather than the segment.
        onStep={(delta) => onChange(wrap(value + delta, MINUTES_PER_DAY))}
      />

      {usesTwelveHourClock ? (
        <div
          role="group"
          aria-label="AM or PM"
          className="ml-1 flex flex-col overflow-hidden rounded-xl border border-input"
        >
          {(["am", "pm"] as const).map((meridiem) => {
            const isActive = (meridiem === "pm") === isAfternoon;
            return (
              <button
                key={meridiem}
                type="button"
                disabled={disabled}
                aria-pressed={isActive}
                onClick={() =>
                  commit((hour24 % 12) + (meridiem === "pm" ? 12 : 0), minute)
                }
                className={cn(
                  "h-5 w-9 text-[0.65rem] font-semibold uppercase transition disabled:pointer-events-none disabled:opacity-60",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                )}
              >
                {meridiem}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { TimeField };
