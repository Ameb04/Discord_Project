import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Multi-line text input.
 *
 * The drag handle is off everywhere on purpose: a user-resized box escapes the
 * layout it sits in — a composer dragged tall pushes the message list off
 * screen, and a field dragged tall inside a dialog overflows the panel. Height
 * is owned by the caller through `min-h-*` / `max-h-*`, and anything past that
 * scrolls **inside** the box.
 *
 * `leading-6` is not decorative: Persian and Arabic descenders are clipped by
 * the tighter line-height that `text-sm` brings with it.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 resize-none overflow-y-auto rounded-xl border border-input bg-white/[0.04] px-3 py-2.5 text-sm leading-6 text-foreground shadow-sm transition-[color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/70 selection:bg-white/20 selection:text-white",
        "focus-visible:border-ring focus-visible:bg-white/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
