import type { FormEvent } from "react";

type SearchBarProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

function SearchBar({ value, disabled = false, onChange, onSubmit }: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="text-sm font-medium text-white/80" htmlFor="user-search">
        Name or phone number
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="user-search"
          type="search"
          value={value}
          placeholder="Search by name or phone number"
          disabled={disabled}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Searching..." : "Search"}
        </button>
      </div>
    </form>
  );
}

export default SearchBar;
