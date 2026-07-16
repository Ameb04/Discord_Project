import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const APP_NAME = "Discord Project";

interface BrandMarkProps {
  className?: string;
  /** Hide the wordmark and show only the glyph. */
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div className={cn("flex select-none items-center gap-3", className)}>
      <span className="bg-brand-gradient relative grid size-10 place-items-center rounded-2xl shadow-glow">
        <MessagesSquare className="size-5 text-white" aria-hidden="true" />
      </span>

      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[10px] font-medium uppercase tracking-[0.34em] text-muted-foreground">
            Chat • Connect
          </span>
          <span className="block text-lg font-semibold tracking-tight text-foreground">
            {APP_NAME}
          </span>
        </span>
      ) : null}
    </div>
  );
}
