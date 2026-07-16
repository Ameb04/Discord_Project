import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  icon?: ReactNode;
}

export function TextField({ label, helperText, icon, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <Input id={fieldId} className={icon ? `pl-10 ${className ?? ""}` : className} {...props} />
      </div>
      {helperText ? (
        <span className="text-xs text-muted-foreground/80">{helperText}</span>
      ) : null}
    </div>
  );
}
