import { cn } from "@/lib/utils";

type CharacterCounterProps = {
  /** Point the field's `aria-describedby` here. */
  id?: string;
  value: string;
  max: number;
  /** How many characters short of the ceiling the counter starts warning. */
  warnRemaining?: number;
  className?: string;
};

/**
 * `used/max` beside a capped field.
 *
 * Always paired with `maxLength` on the control it describes: the attribute
 * stops the keystrokes, and this makes the stop legible instead of the field
 * silently going deaf.
 */
function CharacterCounter({
  id,
  value,
  max,
  warnRemaining = 10,
  className,
}: CharacterCounterProps) {
  const isNearLimit = max - value.length <= warnRemaining;

  return (
    <span
      id={id}
      aria-live="polite"
      className={cn(
        "text-xs tabular-nums",
        isNearLimit ? "text-amber-300/90" : "text-muted-foreground/70",
        className
      )}
    >
      {value.length}/{max}
    </span>
  );
}

export { CharacterCounter };
