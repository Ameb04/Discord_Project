import { LoaderCircle, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { searchUsers } from "@/api/users";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/apiError";
import { initialsFor, personDisplayName } from "@/lib/format";
import type { PublicUser } from "@/types/user";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 1;

type MemberAdderProps = {
  /** Phone numbers already in the room, so their rows read "Member". */
  memberPhones: Set<string>;
  /** Adds the person. Rejecting surfaces the server's reason on the row. */
  onAdd: (user: PublicUser) => Promise<void>;
  /** What the room is called in the failure message. */
  roomLabel: string;
};

/**
 * Search people and add them to a room.
 *
 * Whether the caller is allowed to add anyone at all is the caller's business;
 * this only knows how to find a person and hand them over. A target who turned
 * off "allow adding me" is not predictable from here — that switch is not
 * public — so a rejection surfaces as the server's own message on the row that
 * was attempted. Anyone else can still join through the invite link.
 */
function MemberAdder({ memberPhones, onAdd, roomLabel }: MemberAdderProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [addError, setAddError] = useState("");

  const trimmedQuery = query.trim();

  useEffect(() => {
    let isCurrent = true;

    async function runSearch() {
      if (trimmedQuery.length < MIN_QUERY_LENGTH) {
        setResults([]);
        setSearchError("");
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const users = await searchUsers(trimmedQuery);
        if (!isCurrent) return;
        setResults(users);
        setSearchError("");
      } catch (err) {
        if (!isCurrent) return;
        setResults([]);
        setSearchError(apiErrorMessage(err, "Could not search for people."));
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }

    // Debounced so a fast typist issues one request, not one per keystroke.
    const timer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  async function handleAdd(user: PublicUser) {
    setPendingPhone(user.phone_number);
    setAddError("");

    try {
      await onAdd(user);
      setQuery("");
      setResults([]);
    } catch (err) {
      setAddError(
        apiErrorMessage(
          err,
          `Could not add ${personDisplayName(user)} to this ${roomLabel}.`,
          ["user"]
        )
      );
    } finally {
      setPendingPhone(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          placeholder="Search people by name or phone number"
          aria-label="Search people to add"
          className="h-11 pl-10"
          onChange={(event) => {
            setQuery(event.target.value);
            setAddError("");
          }}
        />
      </div>

      {addError ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
        >
          {addError}
        </p>
      ) : null}

      {searchError ? (
        <p role="alert" className="text-sm text-red-200">
          {searchError}
        </p>
      ) : null}

      {isSearching ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Searching...
        </p>
      ) : null}

      {!isSearching && trimmedQuery && results.length === 0 && !searchError ? (
        <p className="text-sm text-muted-foreground">
          Nobody matched &ldquo;{trimmedQuery}&rdquo;.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="grid gap-1.5">
          <AnimatedListPresence>
            {results.map((user, index) => {
              const displayName = personDisplayName(user, "Unnamed user");
              const isMember = memberPhones.has(user.phone_number);
              const isPending = pendingPhone === user.phone_number;

              return (
                <AnimatedListItem key={user.phone_number} index={index} className="min-w-0">
                  <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-white/[0.03] px-3 py-2">
                    <Avatar className="size-9 shrink-0 border border-border">
                      {user.avatar_url ? (
                        <AvatarImage src={user.avatar_url} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-foreground">
                        {initialsFor(displayName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.phone_number}
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isMember ? "outline" : "default"}
                      className="shrink-0"
                      disabled={isMember || isPending}
                      onClick={() => void handleAdd(user)}
                    >
                      {isMember ? (
                        "Member"
                      ) : isPending ? (
                        <>
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                          Adding...
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" aria-hidden="true" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                </AnimatedListItem>
              );
            })}
          </AnimatedListPresence>
        </ul>
      ) : null}
    </div>
  );
}

export { MemberAdder };
