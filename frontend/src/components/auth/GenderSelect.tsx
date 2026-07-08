interface GenderSelectProps {
  value: "male" | "female";
  onChange: (value: "male" | "female") => void;
  label: string;
}

export function GenderSelect({ value, onChange, label }: GenderSelectProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-white/80">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "male" | "female")}
        className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition focus:border-white/30 focus:bg-white/[0.07]"
      >
        <option value="male" className="text-black">
          Male
        </option>
        <option value="female" className="text-black">
          Female
        </option>
      </select>
    </label>
  );
}