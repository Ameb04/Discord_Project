import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-xl border border-input bg-white/[0.04] px-4 py-1 text-sm text-foreground shadow-sm transition-[color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/70 selection:bg-white/20 selection:text-white",
        "file:mr-4 file:inline-flex file:h-8 file:items-center file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-white/15",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:bg-white/[0.06]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}

export { Input };
