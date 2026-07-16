import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GenderSelectProps {
  value: "male" | "female";
  onChange: (value: "male" | "female") => void;
  label: string;
}

export function GenderSelect({ value, onChange, label }: GenderSelectProps) {
  const fieldId = useId();

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as "male" | "female")}>
        <SelectTrigger id={fieldId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="male">Male</SelectItem>
          <SelectItem value="female">Female</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
