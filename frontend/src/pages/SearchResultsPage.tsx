import { useState } from "react";
import { searchUsers } from "../api/users";
import SearchBar from "../components/SearchBar";
import UserCard from "../components/UserCard";
import type { PublicUser } from "../types/user";

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
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="max-w-2xl">
        <p className="text-xs uppercase text-white/45">People</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Find people
        </h1>
        <p className="mt-3 text-sm leading-7 text-white/60">
          Search for another user by their name or phone number.
        </p>
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">
        <SearchBar
          value={query}
          disabled={isLoading}
          onChange={setQuery}
          onSubmit={handleSearch}
        />
      </section>

      <section
        className="mt-8"
        aria-live="polite"
        aria-busy={isLoading}
        aria-label="Search results"
      >
        {isLoading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-6 text-sm text-white/60">
            Searching for people...
          </div>
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-100/80"
          >
            {error}
          </div>
        )}

        {!isLoading && !error && !hasSearched && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center text-sm text-white/45">
            Search results will appear here.
          </div>
        )}

        {!isLoading && !error && hasSearched && users.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <p className="font-medium text-white/80">No people found</p>
            <p className="mt-2 text-sm text-white/45">
              Try a different name or phone number.
            </p>
          </div>
        )}

        {!isLoading && !error && users.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-white">Search results</h2>
              <span className="text-xs text-white/40">
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
