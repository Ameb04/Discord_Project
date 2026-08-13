import { CalendarClock, Clock, Globe, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog } from "@/components/ui/dialog";
import { useNow } from "@/hooks/useNow";
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

type ScheduleMessageDialogProps = {
  open: boolean;
  conversationLabel: string;
  /**
   * Delivery time to open on. Must be referentially stable while the dialog is
   * open — a fresh `Date` every render would reset the draft continuously.
   */
  initialValue: Date;
  disabled?: boolean;
  onCancel: () => void;
  /** Called with the chosen moment when the user confirms. */
  onConfirm: (value: Date) => void;
};

/** Presets are "the same choice" if they land within a minute of each other. */
const matchesPreset = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) < MINUTE_MS;

/**
 * Delivery-time picker, as a modal.
 *
 * It was previously an inline block above the composer, which pushed the
 * message list off-screen the moment it opened — on a phone the composer itself
 * scrolled away. A dialog keeps the conversation where it was and gives the
 * calendar room to breathe.
 *
 * The dialog owns a *draft* time and only reports it on confirm, so dismissing
 * it leaves the composer exactly as it was found.
 */
function ScheduleMessageDialog({
  open,
  conversationLabel,
  initialValue,
  disabled = false,
  onCancel,
  onConfirm,
}: ScheduleMessageDialogProps) {
  // The chosen moment goes stale on its own; re-check it against a ticking
  // clock rather than only when something else changes.
  const now = useNow(15_000);
  const [draft, setDraft] = useState(initialValue);
  const [seed, setSeed] = useState(initialValue);

  // Reopening starts from the caller's value, not the last edit. Adjusting
  // during render rather than in an effect keeps the first painted frame
  // correct — an effect would flash the previous draft first.
  if (seed !== initialValue) {
    setSeed(initialValue);
    setDraft(initialValue);
  }

  const presets = useMemo(() => buildSchedulePresets(now), [now]);
  const isPast = draft.getTime() <= now.getTime();

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Schedule message"
      description={`Delivered to ${conversationLabel} even while you are offline.`}
      icon={<CalendarClock className="size-4.5" aria-hidden="true" />}
      className="sm:max-w-xl"
      footer={
        <div className="flex flex-col gap-3">
          <div
            aria-live="polite"
            className={cn(
              "flex items-center gap-2 text-sm",
              isPast ? "text-red-200" : "text-foreground"
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
                <span className="min-w-0">
                  Sends {formatDeliveryMoment(draft, now)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatRelativeToNow(draft, now)}
                  </span>
                </span>
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPast || disabled}
              onClick={() => onConfirm(draft)}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              Set delivery time
            </Button>
          </div>
        </div>
      }
    >
      <AnimatedContent direction="up" distance={10} className="grid gap-5">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Quick delivery times"
        >
          {presets.map((preset) => {
            const isActive = matchesPreset(preset.at, draft);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={isActive}
                onClick={() => setDraft(preset.at)}
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

        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Calendar
            selected={draft}
            minDate={now}
            disabled={disabled}
            onSelect={(day) =>
              setDraft(atMinutes(day, minutesSinceMidnight(draft)))
            }
            className="mx-auto sm:mx-0 sm:border-r sm:border-white/[0.07] sm:pr-5"
          />

          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                Delivery time
              </p>
              <TimeField
                value={minutesSinceMidnight(draft)}
                disabled={disabled}
                aria-label="Delivery time"
                onChange={(minutes) => setDraft(atMinutes(draft, minutes))}
              />
              <p className="mt-2 text-xs text-muted-foreground/70">
                Type a time or use the arrow keys — any minute works.
              </p>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Times shown in {localTimeZone}</span>
            </p>
          </div>
        </div>
      </AnimatedContent>
    </Dialog>
  );
}

export { ScheduleMessageDialog };
