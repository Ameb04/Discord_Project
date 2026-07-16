import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <Label htmlFor="user-search">Name or phone number</Label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="user-search"
            type="search"
            value={value}
            placeholder="Search by name or phone number"
            disabled={disabled}
            autoComplete="off"
            className="h-12 pl-10"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={disabled || !value.trim()}
          className="sm:w-32"
        >
          {disabled ? "Searching..." : "Search"}
        </Button>
      </div>
    </form>
  );
}

export default SearchBar;
