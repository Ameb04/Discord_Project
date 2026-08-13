import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  formatMonthTitle,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  weekdayHeadings,
} from "@/lib/datetime";

type CalendarProps = {
  selected: Date | null;
  /** Earliest selectable day, inclusive. Days before it render disabled. */
  minDate?: Date;
  /** Latest selectable day, inclusive. */
  maxDate?: Date;
  onSelect: (day: Date) => void;
  className?: string;
  disabled?: boolean;
};

const WEEKS_SHOWN = 6;

/** The 42 days of the grid: the selected month padded out to whole weeks. */
function buildGrid(month: Date) {
  const firstOfMonth = startOfMonth(month);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  return Array.from({ length: WEEKS_SHOWN * 7 }, (_, index) =>
    addDays(gridStart, index)
  );
}

/**
 * Month grid with roving-tabindex keyboard navigation.
 *
 * Built in-repo rather than pulled from a date-picker library: the whole
 * surface is a fixed grid of buttons, and owning it keeps the dark theme and
 * the disabled-past rules consistent with the rest of the app.
 */
function Calendar({
  selected,
  minDate,
  maxDate,
  onSelect,
  className,
  disabled = false,
}: CalendarProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selected ?? minDate ?? new Date())
  );
  // The single day that takes tab focus; arrow keys move it without selecting.
  const [focusedDay, setFocusedDay] = useState(() =>
    startOfDay(selected ?? minDate ?? new Date())
  );

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDay = useMemo(() => (minDate ? startOfDay(minDate) : null), [minDate]);
  const maxDay = useMemo(() => (maxDate ? startOfDay(maxDate) : null), [maxDate]);
  const days = useMemo(() => buildGrid(visibleMonth), [visibleMonth]);
  const headings = useMemo(() => weekdayHeadings(), []);

  const isDisabled = (day: Date) =>
    disabled ||
    (minDay !== null && day < minDay) ||
    (maxDay !== null && day > maxDay);

  const canGoBack = minDay === null || startOfMonth(minDay) < visibleMonth;
  const canGoForward = maxDay === null || startOfMonth(maxDay) > visibleMonth;

  function moveFocus(nextDay: Date) {
    const clamped =
      minDay !== null && nextDay < minDay
        ? minDay
        : maxDay !== null && nextDay > maxDay
          ? maxDay
          : nextDay;

    setFocusedDay(clamped);
    if (!isSameMonth(clamped, visibleMonth)) {
      setVisibleMonth(startOfMonth(clamped));
    }
    // The grid re-renders with a new roving target; move the caret with it.
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>('[data-roving="true"]')
        ?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (event.key in moves) {
      event.preventDefault();
      moveFocus(addDays(focusedDay, moves[event.key]));
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      moveFocus(addDays(focusedDay, event.key === "PageUp" ? -28 : 28));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const offset = event.key === "Home" ? 0 : 6;
      moveFocus(addDays(focusedDay, offset - focusedDay.getDay()));
    }
  }

  function shiftMonth(delta: number) {
    const nextMonth = addMonths(visibleMonth, delta);
    setVisibleMonth(nextMonth);
    setFocusedDay(
      isSameMonth(focusedDay, nextMonth) ? focusedDay : startOfMonth(nextMonth)
    );
  }

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={disabled || !canGoBack}
          onClick={() => shiftMonth(-1)}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <div aria-live="polite" className="text-sm font-semibold text-foreground">
          {formatMonthTitle(visibleMonth)}
        </div>
        <button
          type="button"
          aria-label="Next month"
          disabled={disabled || !canGoForward}
          onClick={() => shiftMonth(1)}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">
        {headings.map((heading) => (
          <div
            key={heading.key}
            className="grid h-7 place-items-center text-[0.68rem] font-medium tracking-wide text-muted-foreground/80 uppercase"
          >
            {heading.label.slice(0, 2)}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Choose a delivery date"
        className="grid grid-cols-7 gap-0.5"
        onKeyDown={handleKeyDown}
      >
        {days.map((day) => {
          const outsideMonth = !isSameMonth(day, visibleMonth);
          const dayDisabled = isDisabled(day);
          const isSelected = selected !== null && isSameDay(day, selected);
          const isRoving = isSameDay(day, focusedDay);

          return (
            <button
              key={day.getTime()}
              type="button"
              role="gridcell"
              data-roving={isRoving || undefined}
              tabIndex={isRoving ? 0 : -1}
              disabled={dayDisabled}
              aria-selected={isSelected}
              aria-current={isSameDay(day, today) ? "date" : undefined}
              onFocus={() => setFocusedDay(day)}
              onClick={() => {
                setFocusedDay(day);
                if (!isSameMonth(day, visibleMonth)) {
                  setVisibleMonth(startOfMonth(day));
                }
                onSelect(day);
              }}
              className={cn(
                "grid size-9 place-items-center rounded-lg text-sm tabular-nums transition",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-25",
                outsideMonth ? "text-muted-foreground/50" : "text-foreground/90",
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary"
                  : "hover:bg-white/[0.08]",
                !isSelected &&
                  isSameDay(day, today) &&
                  "font-semibold text-primary ring-1 ring-primary/40 ring-inset"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Calendar };
