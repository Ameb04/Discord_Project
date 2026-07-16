import { AlertCircle, SearchX, Users } from "lucide-react";
import { useState } from "react";
import { searchUsers } from "../api/users";
import SearchBar from "../components/SearchBar";
import UserCard from "../components/UserCard";
import { PageHeader } from "../components/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicUser } from "../types/user";

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 py-12 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function SearchResultsPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(nextQuery: string) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      setUsers([]);
      setError("");
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    setHasSearched(true);

    try {
      const matchedUsers = await searchUsers(trimmedQuery);
      setUsers(matchedUsers);
    } catch {
      setUsers([]);
      setError("User search is unavailable right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        eyebrow="People"
        title="Find people"
        description="Search for another user by their name or phone number, then start a direct chat."
      />

      <Card className="mt-8 p-5 sm:p-6">
        <SearchBar
          value={query}
          disabled={isLoading}
          onChange={setQuery}
          onSubmit={handleSearch}
        />
      </Card>

      <section
        className="mt-8"
        aria-live="polite"
        aria-busy={isLoading}
        aria-label="Search results"
      >
        {isLoading && (
          <div className="grid gap-3" aria-label="Loading results">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card/40 p-4"
              >
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {!isLoading && !error && !hasSearched && (
          <EmptyState
            icon={<Users className="size-6" />}
            title="Search for people"
            hint="Results will appear here once you search by name or phone number."
          />
        )}

        {!isLoading && !error && hasSearched && users.length === 0 && (
          <EmptyState
            icon={<SearchX className="size-6" />}
            title="No people found"
            hint="Try a different name or phone number."
          />
        )}

        {!isLoading && !error && users.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-foreground">Search results</h2>
              <span className="text-xs text-muted-foreground">
                {users.length} {users.length === 1 ? "person" : "people"}
              </span>
            </div>
            <ul className="grid gap-3">
              {users.map((user) => (
                <UserCard key={user.phone_number} user={user} />
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

export default SearchResultsPage;
