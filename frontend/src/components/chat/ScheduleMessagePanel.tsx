import { CalendarDays, Clock, Globe, Send, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  MINUTE_MS,
  atMinutes,
  buildSchedulePresets,
  formatDeliveryMoment,
  formatRelativeToNow,
  localTimeZone,
  minutesSinceMidnight,
} from "@/lib/datetime";

import { TimeField } from "./TimeField";

type ScheduleMessagePanelProps = {
  conversationLabel: string;
  value: Date;
  /** Ticking "now" from the composer, so this panel and the send button agree
   *  on whether the chosen moment is still in the future. */
  now: Date;
  onChange: (value: Date) => void;
  onClose: () => void;
  disabled?: boolean;
};

/** Presets are "the same choice" if they land within a minute of each other. */
const matchesPreset = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) < MINUTE_MS;

/**
 * Delivery-time editor for the composer: quick presets for the common case, a
 * calendar plus time selects for everything else, and a running summary of what
 * was actually chosen.
 *
 * It owns no submit affordance — the composer's send button stays the single
 * place a message leaves from, scheduled or not.
 */
function ScheduleMessagePanel({
  conversationLabel,
  value,
  now,
  onChange,
  onClose,
  disabled = false,
}: ScheduleMessagePanelProps) {
  const presets = useMemo(() => buildSchedulePresets(now), [now]);
  const isPast = value.getTime() <= now.getTime();

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.07]">
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            Schedule message
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Delivered to {conversationLabel} even while you are offline.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Cancel scheduling"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="px-4 py-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Quick delivery times"
        >
          {presets.map((preset) => {
            const isActive = matchesPreset(preset.at, value);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={isActive}
                onClick={() => onChange(preset.at)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isActive
                    ? "border-primary/50 bg-primary/20 text-foreground"
                    : "border-border bg-white/[0.03] text-muted-foreground hover:border-white/25 hover:bg-white/[0.07] hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5">
          <Calendar
            selected={value}
            minDate={now}
            disabled={disabled}
            onSelect={(day) => onChange(atMinutes(day, minutesSinceMidnight(value)))}
            className="sm:border-r sm:border-white/[0.07] sm:pr-5"
          />

          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                Delivery time
              </p>
              <TimeField
                value={minutesSinceMidnight(value)}
                disabled={disabled}
                aria-label="Delivery time"
                onChange={(minutes) => onChange(atMinutes(value, minutes))}
              />
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Times shown in {localTimeZone}</span>
            </p>
          </div>
        </div>
      </div>

      <div
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 border-t px-4 py-3 text-sm",
          isPast
            ? "border-destructive/25 bg-destructive/10 text-red-100"
            : "border-white/[0.07] bg-black/20 text-foreground"
        )}
      >
        {isPast ? (
          <>
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            That time has already passed — pick a later one.
          </>
        ) : (
          <>
            <Send className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Sends {formatDeliveryMoment(value, now)}
              <span className="text-muted-foreground">
                {" · "}
                {formatRelativeToNow(value, now)}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export { ScheduleMessagePanel };
