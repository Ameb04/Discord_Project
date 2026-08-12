import {
  ArrowDown,
  Clock3,
  Loader2,
  MessageCircle,
  Search,
  SearchX,
  WifiOff,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { getChatMessageContext, getChatMessages, searchChatMessages } from "../api/chats";
import { chatWebSocketUrl, parseLiveMessageEvent } from "../api/chatSocket";
import MessageComposer from "../components/chat/MessageComposer";
import MessageList from "../components/chat/MessageList";
import { Skeleton } from "../components/ui/skeleton";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import type { ChatMessage, ChatSearchResult } from "../types/chat";

type ChatPageProps = {
  chatId: number;
  title?: string;
  subtitle?: string;
};

type LiveConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

const MAX_RECONNECT_ATTEMPTS = 5;

function mergeMessagesById(
  currentMessages: ChatMessage[],
  incomingMessages: ChatMessage[]
) {
  const messagesById = new Map(
    currentMessages.map((message) => [message.id, message])
  );
  for (const message of incomingMessages) {
    messagesById.set(message.id, message);
  }
  return Array.from(messagesById.values()).sort((first, second) => {
    const timestampOrder = first.sent_at.localeCompare(second.sent_at);
    return timestampOrder || first.id - second.id;
  });
}

function extractChatError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { status?: number; data?: { detail?: unknown } };
      message?: string;
    };

    if (maybeAxiosError.response?.status === 403) {
      return "You do not have access to this chat.";
    }
    if (maybeAxiosError.response?.status === 404) {
      return "This chat could not be found.";
    }
    if (typeof maybeAxiosError.response?.data?.detail === "string") {
      return maybeAxiosError.response.data.detail;
    }
    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Unable to load this chat right now.";
}

function formatSentAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function displayName(result: ChatSearchResult) {
  if (!result.sender) return "Unknown user";
  const fullName = `${result.sender.first_name} ${result.sender.last_name}`.trim();
  return fullName || result.sender.phone_number;
}

function ChatPage({ chatId, title, subtitle }: ChatPageProps) {
  const { user } = useAuth();
  const messageRefs = useRef<Record<number, HTMLLIElement | null>>({});

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [error, setError] = useState("");
  const [liveConnectionState, setLiveConnectionState] =
    useState<LiveConnectionState>("connecting");

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);

  const fallbackTitle = useMemo(() => `Chat #${chatId}`, [chatId]);
  const trimmedSearchQuery = searchQuery.trim();

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      setIsLoading(true);
      setMessages([]);
      setError("");
      setSearchError("");
      setSearchResults([]);
      setSearchedQuery("");
      setHighlightMessageId(null);

      try {
        const history = await getChatMessages(chatId);
        if (isCurrent) {
          setMessages((currentMessages) =>
            mergeMessagesById(currentMessages, history.results)
          );
          setHasOlderMessages(history.has_older);
        }
      } catch (err) {
        if (isCurrent) {
          setMessages([]);
          setHasOlderMessages(false);
          setError(extractChatError(err));
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadMessages();

    return () => {
      isCurrent = false;
    };
  }, [chatId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let shouldCatchUp = false;
    let disposed = false;

    async function catchUpRecentMessages() {
      try {
        const history = await getChatMessages(chatId);
        if (disposed) return;
        setMessages((currentMessages) =>
          mergeMessagesById(currentMessages, history.results)
        );
        setHasOlderMessages((currentValue) =>
          currentValue || history.has_older
        );
      } catch {
        // REST loading and sending stay usable if reconnect catch-up fails.
      }
    }

    function connect() {
      if (disposed) return;

      setLiveConnectionState(
        reconnectAttempts > 0 ? "reconnecting" : "connecting"
      );
      try {
        socket = new WebSocket(chatWebSocketUrl(chatId));
      } catch {
        shouldCatchUp = true;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          setLiveConnectionState("disconnected");
          return;
        }
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
        reconnectAttempts += 1;
        setLiveConnectionState("reconnecting");
        reconnectTimer = setTimeout(connect, delay);
        return;
      }

      socket.onopen = () => {
        if (disposed) {
          socket?.close(1000, "Conversation changed");
          return;
        }

        const catchUpNeeded = shouldCatchUp;
        reconnectAttempts = 0;
        shouldCatchUp = false;
        setLiveConnectionState("connected");
        if (catchUpNeeded) {
          void catchUpRecentMessages();
        }
      };

      socket.onmessage = (event) => {
        if (disposed || typeof event.data !== "string") return;
        const message = parseLiveMessageEvent(event.data);
        if (!message || message.chat !== chatId) return;

        setMessages((currentMessages) =>
          mergeMessagesById(currentMessages, [message])
        );
      };

      socket.onerror = () => {
        if (!disposed) setLiveConnectionState("reconnecting");
      };

      socket.onclose = (event) => {
        socket = null;
        if (disposed) return;

        shouldCatchUp = true;
        if (event.code === 4401 || event.code === 4403) {
          setLiveConnectionState("disconnected");
          return;
        }
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          setLiveConnectionState("disconnected");
          return;
        }

        const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
        reconnectAttempts += 1;
        setLiveConnectionState("reconnecting");
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close(1000, "Conversation changed");
      }
    };
  }, [chatId]);

  useEffect(() => {
    if (highlightMessageId == null) return;
    const node = messageRefs.current[highlightMessageId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId, messages]);

  function handleMessageSent(message: ChatMessage) {
    setMessages((currentMessages) =>
      mergeMessagesById(currentMessages, [message])
    );
    setHighlightMessageId(message.id);
  }

  async function handleLoadOlder() {
    if (isLoadingOlder || !hasOlderMessages || messages.length === 0) return;

    setIsLoadingOlder(true);
    setError("");

    try {
      const oldestMessageId = messages[0]?.id;
      if (!oldestMessageId) return;

      const history = await getChatMessages(chatId, {
        before: oldestMessageId,
      });

      if (history.results.length > 0) {
        setMessages((currentMessages) => {
          const existingIds = new Set(currentMessages.map((message) => message.id));
          const olderMessages = history.results.filter(
            (message) => !existingIds.has(message.id)
          );
          return [...olderMessages, ...currentMessages];
        });
      }
      setHasOlderMessages(history.has_older);
    } catch (err) {
      setError(extractChatError(err));
    } finally {
      setIsLoadingOlder(false);
    }
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedSearchQuery || isSearching) return;

    setIsSearching(true);
    setSearchError("");
    setSearchedQuery(trimmedSearchQuery);

    try {
      const response = await searchChatMessages(chatId, trimmedSearchQuery);
      setSearchResults(response.results);
      if (response.results.length === 0) {
        setHighlightMessageId(null);
      }
    } catch (err) {
      setSearchResults([]);
      setSearchError(extractChatError(err));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleOpenSearchResult(messageId: number) {
    setError("");
    setSearchError("");

    try {
      const context = await getChatMessageContext(chatId, messageId);
      setMessages(context.results);
      setHasOlderMessages(context.has_older);
      setHighlightMessageId(context.focus_message_id);
    } catch (err) {
      setError(extractChatError(err));
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSearchQuery("");
      setSearchResults([]);
      setSearchedQuery("");
      setSearchError("");
    }
  }

  const emptySearchState = searchedQuery && !isSearching && searchResults.length === 0 && !searchError;
  const emptyHistory = !isLoading && !error && messages.length === 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <header className="flex items-center gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="bg-brand-gradient grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg shadow-primary/25">
          <MessageCircle className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">
            {title ?? fallbackTitle}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {isLoading
              ? "Loading messages..."
              : `${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
          </p>
          {liveConnectionState === "reconnecting" ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-200/80">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Reconnecting live updates...
            </p>
          ) : liveConnectionState === "disconnected" ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <WifiOff className="size-3" aria-hidden="true" />
              Live updates unavailable. Reopen the chat to retry.
            </p>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSearchSubmit}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search messages in this chat"
                disabled={isLoading || Boolean(error) || isSearching}
                className="h-11 pl-10"
              />
            </div>
            <Button type="submit" disabled={isLoading || Boolean(error) || isSearching || !trimmedSearchQuery}>
              {isSearching ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </Button>
          </form>

          {searchError ? (
            <div
              role="alert"
              className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
            >
              {searchError}
            </div>
          ) : null}

          {!searchError && searchedQuery ? (
            <div className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Search results</p>
                  <p className="text-xs text-muted-foreground">
                    {isSearching
                      ? "Looking for matching messages..."
                      : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${searchedQuery}"`}
                  </p>
                </div>
                {searchResults.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Click a result to jump there
                  </span>
                ) : null}
              </div>

              {isSearching ? (
                <div className="grid gap-2">
                  <Skeleton className="h-20 w-full rounded-2xl" />
                  <Skeleton className="h-20 w-full rounded-2xl" />
                </div>
              ) : emptySearchState ? (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-white/[0.02] px-4 py-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <SearchX className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">No messages matched</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try another keyword or phrase from this conversation.
                    </p>
                  </div>
                </div>
              ) : searchResults.length > 0 ? (
                <ul className="grid gap-2">
                  {searchResults.map((result) => {
                    const senderName = displayName(result);
                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => void handleOpenSearchResult(result.id)}
                          className="w-full rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="truncate font-medium text-foreground">{senderName}</p>
                            <time className="text-xs text-muted-foreground" dateTime={result.sent_at}>
                              {formatSentAt(result.sent_at)}
                            </time>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {result.preview}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/70">
                            <Clock3 className="size-3.5" />
                            <span>Message #{result.id}</span>
                            {result.is_edited ? <span>· edited</span> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-5 sm:px-6">
          {isLoading ? (
            <div className="grid gap-4" aria-label="Loading messages">
              <Skeleton className="h-20 w-3/4" />
              <Skeleton className="ml-auto h-24 w-2/3" />
              <Skeleton className="h-16 w-1/2" />
            </div>
          ) : null}

          {!isLoading && error ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
            >
              {error}
            </div>
          ) : null}

          {!isLoading && !error && hasOlderMessages ? (
            <div className="mb-5 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoadingOlder}
                onClick={() => void handleLoadOlder()}
              >
                {isLoadingOlder ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading older...
                  </>
                ) : (
                  <>
                    <ArrowDown className="size-4" />
                    Load older messages
                  </>
                )}
              </Button>
            </div>
          ) : null}

          {!isLoading && !error && emptyHistory ? (
            <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MessageCircle className="size-6" aria-hidden="true" />
                </span>
                <p className="font-medium text-foreground">No messages yet</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Messages for this conversation will appear here once the chat starts.
                </p>
              </div>
            </div>
          ) : null}

          {!isLoading && !error && messages.length > 0 ? (
            <MessageList
              messages={messages}
              currentUser={user}
              highlightMessageId={highlightMessageId}
              messageRefs={messageRefs}
            />
          ) : null}
        </div>
      </div>

      {error ? null : (
        <MessageComposer
          chatId={chatId}
          disabled={isLoading || Boolean(error)}
          onMessageSent={handleMessageSent}
        />
      )}
    </section>
  );
}

export default ChatPage;
