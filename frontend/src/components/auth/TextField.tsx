import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
}

export function TextField({ label, helperText, className = "", ...props }: TextFieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-white/80">{label}</span>
      <input
        {...props}
        className={[
          "h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition",
          "placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.07]",
          className,
        ].join(" ")}
      />
      {helperText ? <span className="text-xs text-white/40">{helperText}</span> : null}
    </label>
  );
}