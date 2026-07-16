import { useId } from "react";
import { Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  { label: "Iran", dialCode: "+98", flag: "🇮🇷" },
  { label: "USA", dialCode: "+1", flag: "🇺🇸" },
  { label: "UK", dialCode: "+44", flag: "🇬🇧" },
  { label: "UAE", dialCode: "+971", flag: "🇦🇪" },
  { label: "Turkey", dialCode: "+90", flag: "🇹🇷" },
];

interface CountryPhoneFieldProps {
  label: string;
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  helperText?: string;
}

export function CountryPhoneField({
  label,
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  helperText,
}: CountryPhoneFieldProps) {
  const fieldId = useId();

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>

      <div className="flex items-stretch gap-2">
        <Select value={countryCode} onValueChange={onCountryCodeChange}>
          <SelectTrigger className="w-[7.5rem] shrink-0" aria-label="Country code">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((country) => (
              <SelectItem key={country.dialCode} value={country.dialCode}>
                <span className="mr-1">{country.flag}</span>
                {country.dialCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-0 flex-1">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={fieldId}
            type="tel"
            inputMode="numeric"
            value={phoneNumber}
            onChange={(event) => onPhoneNumberChange(event.target.value)}
            placeholder="Phone number"
            className="pl-10"
          />
        </div>
      </div>

      {helperText ? (
        <span className="text-xs text-muted-foreground/80">{helperText}</span>
      ) : null}
    </div>
  );
}
