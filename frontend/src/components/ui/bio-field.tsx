import { useId } from "react";

import { CharacterCounter } from "@/components/ui/character-counter";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX_LENGTH, BIO_WARN_REMAINING } from "@/lib/profile";
import { cn } from "@/lib/utils";

type BioFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

/**
 * A capped one-line-ish bio, used for both people and groups.
 *
 * The box is a fixed height that cannot be dragged; a bio at the limit fits
 * inside it, and the browser scrolls within the box rather than letting the
 * field grow. `maxLength` stops typing at the ceiling, and the live counter
 * makes that a visible limit instead of keystrokes silently going nowhere.
 */
function BioField({
  value,
  onChange,
  disabled = false,
  label = "Bio",
  placeholder = "A short line about yourself",
  className,
}: BioFieldProps) {
  const fieldId = useId();
  const counterId = useId();

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={fieldId}>{label}</Label>
        <CharacterCounter
          id={counterId}
          value={value}
          max={BIO_MAX_LENGTH}
          warnRemaining={BIO_WARN_REMAINING}
        />
      </div>
      <Textarea
        id={fieldId}
        value={value}
        rows={2}
        disabled={disabled}
        maxLength={BIO_MAX_LENGTH}
        placeholder={placeholder}
        aria-describedby={counterId}
        // Tall enough that a bio at the limit fits without scrolling in the
        // common case, and fixed so it cannot be dragged out of its layout.
        className="h-20"
        // Enter would submit nothing useful here and a bio is not multi-line
        // content; swallowing it keeps the value to a single visual line.
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onChange={(event) => onChange(event.target.value.slice(0, BIO_MAX_LENGTH))}
      />
    </div>
  );
}

export { BioField };
