import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const MINUTE_STEP = 5;

const pad = (value: number) => String(value).padStart(2, "0");

/** Hour labels in the viewer's own clock convention, keyed by 24-hour value. */
function buildHourOptions(twelveHour: boolean) {
  return Array.from({ length: 24 }, (_, hour) => ({
    value: hour,
    label: twelveHour ? String(hour % 12 || 12) : pad(hour),
  }));
}

/**
 * Hour / minute / meridiem selects over a single "minutes since midnight"
 * value. Minutes snap to a 5-minute grid, but an off-grid value handed in by a
 * quick preset ("in 30 minutes" from 10:07) is kept and offered as-is rather
 * than silently rounded away.
 */
function TimeField({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: TimeFieldProps) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const isAfternoon = hour >= 12;

  const hourOptions = useMemo(
    () => buildHourOptions(usesTwelveHourClock),
    []
  );
  const visibleHours = useMemo(
    () =>
      usesTwelveHourClock
        ? hourOptions.filter(
            (option) => option.value >= 12 === isAfternoon
          )
        : hourOptions,
    [hourOptions, isAfternoon]
  );

  const minuteOptions = useMemo(() => {
    const steps = Array.from(
      { length: 60 / MINUTE_STEP },
      (_, index) => index * MINUTE_STEP
    );
    return steps.includes(minute)
      ? steps
      : [...steps, minute].sort((a, b) => a - b);
  }, [minute]);

  const commit = (nextHour: number, nextMinute: number) =>
    onChange((nextHour * 60 + nextMinute) % MINUTES_PER_DAY);

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="group"
      aria-label={ariaLabel ?? "Delivery time"}
    >
      <Select
        value={String(hour)}
        disabled={disabled}
        onValueChange={(next) => commit(Number(next), minute)}
      >
        <SelectTrigger className="h-10 w-[4.5rem] justify-center px-2 tabular-nums">
          <SelectValue aria-label="Hour" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {visibleHours.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span aria-hidden="true" className="text-muted-foreground">
        :
      </span>

      <Select
        value={String(minute)}
        disabled={disabled}
        onValueChange={(next) => commit(hour, Number(next))}
      >
        <SelectTrigger className="h-10 w-[4.5rem] justify-center px-2 tabular-nums">
          <SelectValue aria-label="Minute" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {minuteOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {pad(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {usesTwelveHourClock && (
        <Select
          value={isAfternoon ? "pm" : "am"}
          disabled={disabled}
          onValueChange={(next) =>
            commit((hour % 12) + (next === "pm" ? 12 : 0), minute)
          }
        >
          <SelectTrigger className="h-10 w-[4.75rem] justify-center px-2">
            <SelectValue aria-label="AM or PM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="am">AM</SelectItem>
            <SelectItem value="pm">PM</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export { TimeField };
