import type { ChangeEvent } from "react";

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
  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPhoneNumberChange(event.target.value);
  };

  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-white/80">{label}</span>

      <div className="grid grid-cols-[8rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition focus-within:border-white/30 focus-within:bg-white/[0.07]">
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          className="h-12 border-0 bg-transparent px-3 text-sm text-white outline-none"
        >
          {COUNTRIES.map((country) => (
            <option key={country.dialCode} value={country.dialCode} className="text-black">
              {country.flag} {country.dialCode}
            </option>
          ))}
        </select>

        <input
          type="tel"
          inputMode="numeric"
          value={phoneNumber}
          onChange={handlePhoneChange}
          placeholder="Phone number"
          className="h-12 border-0 bg-transparent px-4 text-white outline-none placeholder:text-white/30"
        />
      </div>

      {helperText ? <span className="text-xs text-white/40">{helperText}</span> : null}
    </label>
  );
}