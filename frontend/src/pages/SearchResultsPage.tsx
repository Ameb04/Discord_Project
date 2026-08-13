import { CircleAlert, Radio, SearchX, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { discoverChannels } from "../api/channels";
import { searchUsers } from "../api/users";
import SearchBar from "../components/SearchBar";
import UserCard from "../components/UserCard";
import ChannelCard from "@/components/channel/ChannelCard";
import { PageHeader } from "../components/PageHeader";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import {
  AnimatedListItem,
  AnimatedListPresence,
} from "@/components/motion/AnimatedList";
import { springTransition } from "@/components/motion/transitions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { ChannelConversation } from "../types/chat";
import type { PublicUser } from "../types/user";

type SearchScope = "people" | "channels";

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <AnimatedContent
      direction="up"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 py-12 text-center"
    >
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
    </AnimatedContent>
  );
}

function ResultSkeletons() {
  return (
    <div className="grid gap-3" aria-label="Loading results">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="flex items-center gap-4 rounded-2xl border border-border bg-card/40 p-4"
        >
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="hidden h-9 w-24 rounded-lg sm:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * One search box, two things to find.
 *
 * People and public channels are the same intent — "I am looking for somewhere
 * to talk" — so they share a page and a query rather than living behind two
 * separate destinations the user has to choose between before typing.
 *
 * Channels list themselves before any query, because a directory is worth
 * browsing; people do not, because a list of every user is not.
 */
function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope: SearchScope =
    searchParams.get("tab") === "channels" ? "channels" : "people";

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [channels, setChannels] = useState<ChannelConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [hasLoadedDirectory, setHasLoadedDirectory] = useState(false);
  const [directoryReloadKey, setDirectoryReloadKey] = useState(0);

  // The channel directory is browsable, so it loads itself the moment the tab
  // is opened and re-runs whenever the query settles. The old results stay on
  // screen through the debounce rather than flashing a skeleton per keystroke.
  useEffect(() => {
    if (scope !== "channels") return;

    let isCurrent = true;

    async function loadDirectory(term: string) {
      setIsLoading(true);
      try {
        const matched = await discoverChannels(term);
        if (!isCurrent) return;
        setChannels(matched);
        setError("");
      } catch {
        if (!isCurrent) return;
        setChannels([]);
        setError("Channel search is unavailable right now. Please try again.");
      } finally {
        if (isCurrent) {
          setIsLoading(false);
          setHasLoadedDirectory(true);
        }
      }
    }

    const timer = setTimeout(() => void loadDirectory(query.trim()), 300);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [directoryReloadKey, query, scope]);

  async function handleSearch(nextQuery: string) {
    // Channels search as you type; only people wait for a submit, because that
    // request is the expensive one and its results are exact matches.
    if (scope === "channels") return;

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

  function switchScope(next: SearchScope) {
    if (next === scope) return;
    setSearchParams(next === "channels" ? { tab: "channels" } : {}, {
      replace: true,
    });
    setError("");
    setIsLoading(false);
  }

  const isPeople = scope === "people";
  // Skeletons until the directory has answered once; after that a refresh
  // updates in place rather than emptying the list first.
  const showSkeletons = isPeople
    ? isLoading
    : isLoading && !hasLoadedDirectory;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
      <PageHeader
        eyebrow={isPeople ? "People" : "Channels"}
        title={isPeople ? "Find people" : "Explore channels"}
        description={
          isPeople
            ? "Search for another user by their name or phone number, then start a direct chat."
            : "Public channels anyone can join. Private ones only appear once you have an invite."
        }
      />

      <Card className="mt-8 gap-4 p-4 sm:p-6">
        <div
          role="tablist"
          aria-label="What to search"
          className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-white/[0.03] p-1"
        >
          {(
            [
              { key: "people" as const, label: "People", icon: Users, count: users.length },
              {
                key: "channels" as const,
                label: "Channels",
                icon: Radio,
                count: channels.length,
              },
            ]
          ).map(({ key, label, icon: Icon, count }) => {
            const isActive = scope === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => switchScope(key)}
                className={cn(
                  "relative inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="search-scope-pill"
                    className="absolute inset-0 rounded-xl bg-primary/15"
                    transition={springTransition}
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative">{label}</span>
                {count > 0 ? (
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className={cn(
                      "relative h-5 min-w-5 justify-center px-1.5",
                      isActive && "bg-primary/80"
                    )}
                  >
                    {count}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>

        <SearchBar
          value={query}
          disabled={isLoading && isPeople}
          placeholder={
            isPeople
              ? "Search by name or phone number"
              : "Search channels by name or description"
          }
          // The directory filters as you type, so a submit button would be a
          // control that does nothing you have not already done.
          submitLabel={isPeople ? "Search" : null}
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
        {showSkeletons ? <ResultSkeletons /> : null}

        {!showSkeletons && error ? (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
          >
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {!showSkeletons && !error && isPeople ? (
          !hasSearched ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="Search for people"
              hint="Results will appear here once you search by name or phone number."
            />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="No people found"
              hint="Try a different name or phone number."
            />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Search results
                </h2>
                <span className="text-xs text-muted-foreground">
                  {users.length} {users.length === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="grid gap-3">
                <AnimatedListPresence>
                  {users.map((user, index) => (
                    <AnimatedListItem
                      key={user.phone_number}
                      index={index}
                      className="min-w-0"
                    >
                      <UserCard user={user} />
                    </AnimatedListItem>
                  ))}
                </AnimatedListPresence>
              </ul>
            </>
          )
        ) : null}

        {!showSkeletons && !error && !isPeople ? (
          channels.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title={
                query.trim() ? "No channels found" : "No public channels yet"
              }
              hint={
                query.trim()
                  ? "Try a different word, or ask for an invite link if the channel is private."
                  : "Be the first — create a public channel and people will find it here."
              }
            />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Public channels
                </h2>
                <span className="text-xs text-muted-foreground">
                  {channels.length}{" "}
                  {channels.length === 1 ? "channel" : "channels"}
                </span>
              </div>
              <ul className="grid gap-3">
                <AnimatedListPresence>
                  {channels.map((channel, index) => (
                    <AnimatedListItem
                      key={channel.id}
                      index={index}
                      className="min-w-0"
                    >
                      <ChannelCard
                        channel={channel}
                        onJoined={() =>
                          setDirectoryReloadKey((key) => key + 1)
                        }
                      />
                    </AnimatedListItem>
                  ))}
                </AnimatedListPresence>
              </ul>
            </>
          )
        ) : null}
      </section>
    </main>
  );
}

export default SearchResultsPage;
