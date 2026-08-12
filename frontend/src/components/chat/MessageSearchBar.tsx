import {
  ChevronDown,
  ChevronUp,
  ListTree,
  LoaderCircle,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type KeyboardEvent } from "react";

import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { overlayTransition } from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMessageTimestamp, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChatSearchResult } from "@/types/chat";

import { HighlightedText } from "./HighlightedText";

/** Which way through the conversation a step moves. */
export type SearchStep = "older" | "newer";

type MessageSearchBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** True while a request for the current query is in flight. */
  isSearching: boolean;
  error?: string;
  /** Matches for `searchedQuery`, oldest first. */
  results: ChatSearchResult[];
  /** The query `results` belong to — lags `query` by the debounce. */
  searchedQuery: string;
  /** Total matches on the server, which can exceed what it returned. */
  totalCount: number;
  /** Index into `results`, or -1 before the first jump. */
  activeIndex: number;
  onStep: (step: SearchStep) => void;
  onSelect: (index: number) => void;
  onClose: () => void;
};

/**
 * Find-in-conversation, in the shape everyone already knows from a browser's
 * find bar: type, watch the counter, walk the hits with the arrows.
 *
 * The results *list* is secondary and collapsed by default. Stepping through
 * matches in the conversation itself — where each one keeps its surrounding
 * messages, its sender and its timestamp — beats reading them as detached
 * cards, so the list is there for picking a specific hit out of many rather
 * than as the primary way to read them.
 */
function MessageSearchBar({
  query,
  onQueryChange,
  isSearching,
  error,
  results,
  searchedQuery,
  totalCount,
  activeIndex,
  onStep,
  onSelect,
  onClose,
}: MessageSearchBarProps) {
  const [isListOpen, setIsListOpen] = useState(false);

  const hasResults = results.length > 0;
  const hasSearched = Boolean(searchedQuery) && !isSearching && !error;
  const isEmptyResult = hasSearched && !hasResults;
  // The server answers with the most recent matches only; saying so is better
  // than a counter that quietly disagrees with itself.
  const isTruncated = totalCount > results.length;

  const counterLabel = isSearching
    ? "Searching"
    : !searchedQuery
      ? "—"
      : !hasResults
        ? "0"
        : `${activeIndex >= 0 ? activeIndex + 1 : "–"} / ${results.length}`;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Matches start at the newest, so plain Enter walks back through time and
    // Shift+Enter comes forward again — the same pairing as a find bar.
    onStep(event.shiftKey ? "newer" : "older");
  }

  return (
    <motion.div
      key="message-search"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={overlayTransition}
      className="shrink-0 overflow-hidden border-b border-border bg-black/20"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-6">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {isSearching ? (
              <LoaderCircle className="size-4 animate-spin text-primary" />
            ) : (
              <Search className="size-4" />
            )}
          </span>
          <Input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find in conversation"
            aria-label="Find in conversation"
            className="h-10 pl-10"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-white/[0.03] p-1">
          <span
            aria-live="polite"
            className={cn(
              "min-w-16 px-1 text-center text-xs tabular-nums",
              isEmptyResult ? "text-amber-300/90" : "text-muted-foreground"
            )}
          >
            {counterLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={!hasResults || activeIndex === 0}
            aria-label="Previous (older) match"
            title="Older match — Enter"
            onClick={() => onStep("older")}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={!hasResults || activeIndex === results.length - 1}
            aria-label="Next (newer) match"
            title="Newer match — Shift+Enter"
            onClick={() => onStep("newer")}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <Button
          type="button"
          variant={isListOpen ? "default" : "outline"}
          size="icon"
          className="hidden size-9 shrink-0 sm:inline-flex"
          disabled={!hasResults}
          aria-expanded={isListOpen}
          aria-label={isListOpen ? "Hide the list of matches" : "Show all matches"}
          title="All matches"
          onClick={() => setIsListOpen((open) => !open)}
        >
          <ListTree className="size-4" aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Close search"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-3 mb-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-red-100 sm:mx-6"
        >
          {error}
        </p>
      ) : isEmptyResult ? (
        <p className="flex items-center gap-2 px-3 pb-3 text-sm text-muted-foreground sm:px-6">
          <SearchX className="size-4 shrink-0" aria-hidden="true" />
          No message in this conversation contains &ldquo;{searchedQuery}&rdquo;.
        </p>
      ) : isTruncated ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground/80 sm:px-6">
          Showing the {results.length} most recent of {totalCount} matches.
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {isListOpen && hasResults ? (
          <motion.div
            key="match-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={overlayTransition}
            className="overflow-hidden border-t border-border"
          >
            <ul className="grid max-h-[32dvh] gap-1.5 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6">
              <AnimatedListPresence>
                {/* Newest first here, opposite the conversation, because a
                    list is read from the top and the newest hit is the one a
                    search almost always means. */}
                {results
                  .map((result, index) => ({ result, index }))
                  .reverse()
                  .map(({ result, index }) => (
                    <AnimatedListItem
                      key={result.id}
                      index={results.length - 1 - index}
                      className="min-w-0"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(index)}
                        aria-current={index === activeIndex}
                        className={cn(
                          "w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors",
                          index === activeIndex
                            ? "border-primary/50 bg-primary/15"
                            : "border-border bg-white/[0.03] hover:border-primary/40 hover:bg-primary/10"
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium text-foreground">
                            {personDisplayName(result.sender)}
                          </span>
                          <time
                            className="shrink-0 text-xs text-muted-foreground"
                            dateTime={result.sent_at}
                          >
                            {formatMessageTimestamp(result.sent_at)}
                          </time>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          <HighlightedText
                            text={result.preview}
                            query={searchedQuery}
                          />
                        </p>
                      </button>
                    </AnimatedListItem>
                  ))}
              </AnimatedListPresence>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export { MessageSearchBar };
