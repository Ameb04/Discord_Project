import { motion } from "motion/react";

import { springTransition } from "@/components/motion/transitions";
import { cn } from "@/lib/utils";

/** Past this, the exact number stops being information. */
const MAX_SHOWN = 99;

type UnreadBadgeProps = {
  count: number;
  /** Muted rows keep their count, but in grey — it counts without shouting. */
  isMuted?: boolean;
  className?: string;
};

/**
 * The count of messages waiting in a conversation.
 *
 * A filled pill in the brand colour, or a grey one when the room is muted —
 * the same distinction every messenger makes, and the reason muting can leave
 * the number visible at all: silence is about interruption, not about pretending
 * nothing arrived.
 *
 * Renders nothing at zero rather than an empty pill, so a read conversation
 * leaves no residue in the row.
 */
export function UnreadBadge({ count, isMuted = false, className }: UnreadBadgeProps) {
  if (count <= 0) return null;

  const label = count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);

  return (
    <motion.span
      // Keyed on the count so a new message re-runs the entrance, which is the
      // only movement in an otherwise static row.
      key={label}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springTransition}
      aria-label={`${count} unread ${count === 1 ? "message" : "messages"}`}
      className={cn(
        "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums",
        isMuted
          ? "bg-white/12 text-muted-foreground"
          : "bg-primary text-primary-foreground shadow-sm shadow-primary/40",
        className
      )}
    >
      {label}
    </motion.span>
  );
}

export default UnreadBadge;
