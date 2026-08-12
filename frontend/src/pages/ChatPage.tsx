import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Hash,
  Info,
  LoaderCircle,
  Lock,
  MessageCircle,
  Search,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getChatMessageContext,
  getChatMessages,
  getChatReadState,
  markChatRead,
  searchChatMessages,
} from "../api/chats";
import { chatWebSocketUrl, parseLiveChatEvent } from "../api/chatSocket";
import MessageComposer from "../components/chat/MessageComposer";
import MessageList from "../components/chat/MessageList";
import {
  MessageSearchBar,
  type SearchStep,
} from "../components/chat/MessageSearchBar";
import { overlayTransition } from "@/components/motion/transitions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { useChatScrollAnchor } from "@/hooks/useChatScrollAnchor";
import { GroupInfoDialog } from "@/components/group/GroupInfoDialog";
import { UserProfileDialog } from "@/components/user/UserProfileDialog";
import { personDisplayName } from "@/lib/format";
import type {
  ChannelDetail,
  ChatMessage,
  ChatReadState,
  ChatSearchResult,
  GroupConversation,
  GroupDetail,
  Topic,
} from "../types/chat";
import type { PublicUser } from "../types/user";

type ChatPageProps = {
  chatId: number;
  title?: string;
  subtitle?: string;
  /** Present when this chat is a group, which unlocks the info panel. */
  group?: GroupConversation;
  /** Present when this chat is a direct one — the person on the other end. */
  directPeer?: PublicUser;
  /** Present when this chat is a topic, along with the channel that owns it. */
  topic?: Topic;
  topicChannel?: ChannelDetail;
  /** Called when the group's profile changed elsewhere in this view. */
  onGroupChanged?: (group: GroupDetail) => void;
  /** Called after the owner deletes this group. */
  onGroupDeleted?: () => void;
};

type LiveConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

const MAX_RECONNECT_ATTEMPTS = 5;

/** How long typing has to settle before a search actually goes out. */
const SEARCH_DEBOUNCE_MS = 300;

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

/**
 * Search results in reading order — oldest first, like the conversation.
 *
 * The API answers newest-first because it takes the most recent slice; here
 * the index of a match is also its vertical position, which is what makes
 * "previous" mean "further up" for the navigation arrows.
 */
function inConversationOrder(results: ChatSearchResult[]) {
  return [...results].sort(
    (first, second) =>
      first.sent_at.localeCompare(second.sent_at) || first.id - second.id
  );
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

function ChatPage({
  chatId,
  title,
  subtitle,
  group,
  directPeer,
  topic,
  topicChannel,
  onGroupChanged,
  onGroupDeleted,
}: ChatPageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messageRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const historyRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [error, setError] = useState("");
  const [liveConnectionState, setLiveConnectionState] =
    useState<LiveConnectionState>("connecting");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  /**
   * The message the view is pointed at, with a nonce.
   *
   * The nonce is what makes "jump to the hit I am already looking at" work:
   * without it, stepping back to the same message is a no-op state write and
   * nothing re-scrolls.
   */
  const [focusedMessage, setFocusedMessage] = useState<{
    id: number;
    nonce: number;
  } | null>(null);
  const focusNonceRef = useRef(0);

  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [profilePhoneNumber, setProfilePhoneNumber] = useState<string | null>(null);
  const [readState, setReadState] = useState<ChatReadState | null>(null);

  const fallbackTitle = useMemo(() => `Chat #${chatId}`, [chatId]);

  // Whoever runs the room moderates by deleting — a group's owner, a channel's
  // owner and admins. Media stays off until they enable it, though their own
  // uploads are never blocked by their own switch.
  const canModerate = Boolean(group?.is_owner) || Boolean(topicChannel?.is_admin);
  const canAttachFiles = group
    ? group.allow_media || group.is_owner
    : topicChannel
      ? topicChannel.allow_media || topicChannel.is_admin
      : true;
  // A topic can be closed to everyone but the channel's admins.
  const isTopicLocked = Boolean(
    topic && !topic.allow_member_messages && !topicChannel?.is_admin
  );

  const newestMessageId = messages.length ? messages[messages.length - 1].id : null;

  const {
    isAtBottom,
    handleScroll,
    scrollToBottom,
    captureOlderAnchor,
    suspendAutoScroll,
  } = useChatScrollAnchor({
    containerRef: historyRef,
    isLoading,
    newestMessageId,
    messageCount: messages.length,
  });

  // Read by callbacks that must not be rebuilt on every incoming message.
  // Declared before every effect that reads it, so the copy is already current
  // by the time those run.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /**
   * Drop a message from every place the view still references it.
   *
   * Deletion arrives from two directions — the deleter's own request and the
   * socket announcement — so this is written to be safely idempotent.
   */
  const removeMessageById = useCallback((messageId: number) => {
    setMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== messageId)
    );
    // Search results and the scroll target must let go too, or the UI would
    // keep pointing at a message that no longer exists.
    setSearchResults((currentResults) =>
      currentResults.filter((result) => result.id !== messageId)
    );
    setFocusedMessage((current) =>
      current?.id === messageId ? null : current
    );
  }, []);

  /**
   * Delivery state for one of the viewer's own messages.
   *
   * Derived from the watermark map rather than stored per message, so a single
   * incoming read event updates every affected bubble at once and the client
   * can never drift out of step with the server's own arithmetic.
   */
  const receiptFor = useCallback(
    (message: ChatMessage) => {
      if (!readState || message.sender?.phone_number !== user?.phone_number) {
        return undefined;
      }

      const seenByCount = Object.values(readState.watermarks).filter(
        (watermark) => watermark >= message.id
      ).length;

      return {
        seenByCount,
        seenByAll:
          readState.other_member_count > 0 &&
          seenByCount === readState.other_member_count,
      };
    },
    [readState, user?.phone_number]
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      setIsLoading(true);
      setMessages([]);
      setError("");

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
        setHasOlderMessages((currentValue) => currentValue || history.has_older);
      } catch {
        // REST loading and sending stay usable if reconnect catch-up fails.
      }
    }

    function scheduleReconnect() {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        setLiveConnectionState("disconnected");
        return;
      }
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
      reconnectAttempts += 1;
      setLiveConnectionState("reconnecting");
      reconnectTimer = setTimeout(connect, delay);
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
        scheduleReconnect();
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
        const liveEvent = parseLiveChatEvent(event.data);
        if (!liveEvent) return;

        if (liveEvent.type === "message.created") {
          if (liveEvent.message.chat !== chatId) return;
          setMessages((currentMessages) =>
            mergeMessagesById(currentMessages, [liveEvent.message])
          );
          return;
        }

        if (liveEvent.chat !== chatId) return;

        if (liveEvent.type === "message.deleted") {
          removeMessageById(liveEvent.messageId);
          return;
        }

        setReadState((currentState) => {
          // A reader who is not in the map is either the viewer themselves or
          // someone who joined since this snapshot; either way, ignore them
          // until the next load rather than inventing a member.
          if (!currentState || !(liveEvent.reader in currentState.watermarks)) {
            return currentState;
          }
          return {
            ...currentState,
            watermarks: {
              ...currentState.watermarks,
              [liveEvent.reader]: liveEvent.lastReadMessageId,
            },
          };
        });
      };

      socket.onerror = () => {
        if (!disposed) setLiveConnectionState("reconnecting");
      };

      socket.onclose = (event) => {
        socket = null;
        if (disposed) return;

        shouldCatchUp = true;
        // 4401/4403 are the consumer's "not signed in" / "not a member" codes.
        // Retrying those would just replay the same rejection.
        if (event.code === 4401 || event.code === 4403) {
          setLiveConnectionState("disconnected");
          return;
        }
        scheduleReconnect();
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
  }, [chatId, removeMessageById]);

  // Bring the focused message on screen. `messages` is a dependency because a
  // jump can land before the window containing its target has rendered.
  useEffect(() => {
    if (!focusedMessage) return;
    const node = messageRefs.current[focusedMessage.id];
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedMessage, messages]);

  // Who has read what, as of opening the conversation. Live movement arrives
  // over the socket; this is only the starting picture.
  useEffect(() => {
    let isCurrent = true;

    async function loadReadState() {
      setReadState(null);
      try {
        const nextReadState = await getChatReadState(chatId);
        if (isCurrent) setReadState(nextReadState);
      } catch {
        // Receipts are an enhancement; the conversation reads fine without.
      }
    }

    void loadReadState();

    return () => {
      isCurrent = false;
    };
  }, [chatId]);

  // Opening a conversation, or receiving into an open one, counts as reading
  // it. Keyed on the newest id so this fires once per genuinely new message
  // rather than on every render.
  useEffect(() => {
    if (newestMessageId == null) return;

    async function reportRead() {
      try {
        await markChatRead(chatId, newestMessageId ?? undefined);
      } catch {
        // A missed receipt is not worth surfacing, and the watermark only
        // moves forward — the next message reports this one too.
      }
    }

    void reportRead();
  }, [chatId, newestMessageId]);

  const focusMessage = useCallback((messageId: number) => {
    focusNonceRef.current += 1;
    setFocusedMessage({ id: messageId, nonce: focusNonceRef.current });
  }, []);

  /**
   * Put a message on screen, loading the window around it if it is not in the
   * list yet — a match from six months ago is not in the page we are holding.
   */
  const revealMessage = useCallback(
    async (messageId: number) => {
      if (messagesRef.current.some((message) => message.id === messageId)) {
        focusMessage(messageId);
        return;
      }

      // The list is about to be replaced wholesale; the bottom anchor must not
      // treat that as "new messages arrived" and drag the view to the end.
      suspendAutoScroll();
      try {
        const context = await getChatMessageContext(chatId, messageId);
        setMessages(context.results);
        setHasOlderMessages(context.has_older);
        setError("");
        focusMessage(context.focus_message_id);
      } catch (err) {
        setError(extractChatError(err));
      }
    },
    [chatId, focusMessage, suspendAutoScroll]
  );

  /** Make one match the active one and bring the conversation to it. */
  const goToResult = useCallback(
    (results: ChatSearchResult[], index: number) => {
      const result = results[index];
      if (!result) return;
      setActiveResultIndex(index);
      void revealMessage(result.id);
    },
    [revealMessage]
  );

  // Live search: every settled keystroke replaces the result set, and the
  // newest match becomes the active one — the same thing a find bar does when
  // you start typing, and almost always the match a search is looking for.
  // Clearing the field is handled where it happens, in the change handler, so
  // this effect only ever owns the request.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!isSearchOpen || !trimmedQuery) return;

    let isCurrent = true;

    const timer = setTimeout(async () => {
      try {
        const response = await searchChatMessages(chatId, trimmedQuery);
        if (!isCurrent) return;
        const ordered = inConversationOrder(response.results);
        setSearchResults(ordered);
        setSearchTotalCount(response.count);
        setSearchedQuery(trimmedQuery);
        setSearchError("");
        if (ordered.length > 0) {
          goToResult(ordered, ordered.length - 1);
        } else {
          setActiveResultIndex(-1);
          setFocusedMessage(null);
        }
      } catch (err) {
        if (!isCurrent) return;
        setSearchResults([]);
        setSearchTotalCount(0);
        setSearchedQuery(trimmedQuery);
        setSearchError(extractChatError(err));
        setActiveResultIndex(-1);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [chatId, goToResult, isSearchOpen, searchQuery]);

  function handleSearchQueryChange(nextQuery: string) {
    setSearchQuery(nextQuery);

    const trimmedQuery = nextQuery.trim();
    // The spinner belongs to the keystroke, not to the request the debounce
    // has not sent yet — otherwise the bar looks idle while typing.
    setIsSearching(Boolean(trimmedQuery));
    if (trimmedQuery) return;

    setSearchResults([]);
    setSearchedQuery("");
    setSearchTotalCount(0);
    setSearchError("");
    setActiveResultIndex(-1);
    setFocusedMessage(null);
  }

  function closeSearch() {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchedQuery("");
    setSearchTotalCount(0);
    setSearchError("");
    setIsSearching(false);
    setActiveResultIndex(-1);
    setFocusedMessage(null);
  }

  function stepSearch(step: SearchStep) {
    if (searchResults.length === 0) return;
    // No active match yet means the arrows start at the newest one, wherever
    // they were pressed from.
    const nextIndex =
      activeResultIndex < 0
        ? searchResults.length - 1
        : Math.min(
            Math.max(activeResultIndex + (step === "older" ? -1 : 1), 0),
            searchResults.length - 1
          );
    goToResult(searchResults, nextIndex);
  }

  function handleMessageSent(message: ChatMessage) {
    setMessages((currentMessages) =>
      mergeMessagesById(currentMessages, [message])
    );
    // Your own message always pulls the view to the end, wherever you were.
    scrollToBottom("smooth");
  }

  function handleMessageEdited(updatedMessage: ChatMessage) {
    setMessages((currentMessages) =>
      mergeMessagesById(currentMessages, [updatedMessage])
    );
  }

  async function handleLoadOlder() {
    if (isLoadingOlder || !hasOlderMessages || messages.length === 0) return;

    setIsLoadingOlder(true);
    setError("");

    try {
      const oldestMessageId = messages[0]?.id;
      if (!oldestMessageId) return;

      const history = await getChatMessages(chatId, { before: oldestMessageId });

      if (history.results.length > 0) {
        // Measured before the prepend so the row the reader is looking at
        // stays put instead of being pushed down by the new page.
        captureOlderAnchor();
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

  const emptyHistory = !isLoading && !error && messages.length === 0;
  const searchDisabled = isLoading || Boolean(error);
  const headerTitle = group?.name ?? topic?.name ?? title ?? fallbackTitle;

  // The header's identity block leads somewhere in every kind of conversation:
  // to the group's members and settings, to the channel a topic belongs to, or
  // to the other person's profile.
  const identity = group
    ? {
        label: `View ${group.name} members and details`,
        onClick: () => setIsGroupInfoOpen(true),
      }
    : topicChannel
      ? {
          label: `Open the ${topicChannel.name} channel`,
          onClick: () => navigate(`/channels/${topicChannel.id}`),
        }
      : directPeer
        ? {
            label: `View ${personDisplayName(directPeer)}'s profile`,
            onClick: () => setProfilePhoneNumber(directPeer.phone_number),
          }
        : null;

  const conversationAvatar = group ? (
    <Avatar className="hidden size-11 shrink-0 border border-border sm:block">
      {group.avatar_url ? (
        <AvatarImage src={group.avatar_url} alt={group.name} />
      ) : null}
      <AvatarFallback className="bg-primary/15 text-foreground">
        <Users className="size-5" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  ) : topic ? (
    <Avatar className="hidden size-11 shrink-0 border border-border sm:block">
      {topic.avatar_url ? (
        <AvatarImage src={topic.avatar_url} alt={topic.name} />
      ) : null}
      <AvatarFallback className="bg-primary/15 text-foreground">
        <Hash className="size-5" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  ) : directPeer?.avatar_url ? (
    <Avatar className="hidden size-11 shrink-0 border border-border sm:block">
      <AvatarImage src={directPeer.avatar_url} alt={personDisplayName(directPeer)} />
      <AvatarFallback className="bg-primary/15 text-foreground">
        <MessageCircle className="size-5" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  ) : (
    <div className="bg-brand-gradient hidden size-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg shadow-primary/25 sm:grid">
      <MessageCircle className="size-5" aria-hidden="true" />
    </div>
  );

  const statusLine = (
    <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
      {isLoading
        ? "Loading messages..."
        : `${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
      {liveConnectionState === "reconnecting" ? (
        <span className="ml-2 inline-flex items-center gap-1 text-amber-200/80">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
          Reconnecting...
        </span>
      ) : liveConnectionState === "disconnected" ? (
        <span className="ml-2 inline-flex items-center gap-1">
          <WifiOff className="size-3" aria-hidden="true" />
          Live updates unavailable
        </span>
      ) : null}
    </p>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
        {/* On phones the list and the conversation are separate screens, so the
            conversation needs its own way back. */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 lg:hidden"
        >
          <Link to="/home" aria-label="Back to conversations">
            <ArrowLeft className="size-4.5" aria-hidden="true" />
          </Link>
        </Button>

        {conversationAvatar}

        <div className="min-w-0 flex-1">
          {identity ? (
            // `role="heading"` rather than a real `<h1>`: a heading element is
            // not phrasing content and cannot live inside a button, but the
            // name and the line under it are one target.
            <button
              type="button"
              onClick={identity.onClick}
              aria-label={identity.label}
              className="group/identity flex w-full min-w-0 flex-col items-start rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span
                  role="heading"
                  aria-level={1}
                  className="truncate text-base font-semibold text-foreground transition-colors group-hover/identity:text-primary sm:text-lg"
                >
                  {headerTitle}
                </span>
                <Info
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/identity:text-primary"
                  aria-hidden="true"
                />
              </span>
              {subtitle ? (
                <span className="mt-0.5 w-full truncate text-xs text-muted-foreground sm:text-sm">
                  {subtitle}
                </span>
              ) : null}
            </button>
          ) : (
            <>
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {headerTitle}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                  {subtitle}
                </p>
              ) : null}
            </>
          )}
          {statusLine}
        </div>

        <Button
          type="button"
          variant={isSearchOpen ? "default" : "outline"}
          size="icon"
          className="size-9 shrink-0"
          disabled={searchDisabled}
          aria-expanded={isSearchOpen}
          aria-label={isSearchOpen ? "Close message search" : "Search messages"}
          onClick={() => {
            if (isSearchOpen) {
              closeSearch();
            } else {
              setIsSearchOpen(true);
            }
          }}
        >
          {isSearchOpen ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {isSearchOpen ? (
          <MessageSearchBar
            key="message-search"
            query={searchQuery}
            onQueryChange={handleSearchQueryChange}
            isSearching={isSearching}
            error={searchError}
            results={searchResults}
            searchedQuery={searchedQuery}
            totalCount={searchTotalCount}
            activeIndex={activeResultIndex}
            onStep={stepSearch}
            onSelect={(index) => goToResult(searchResults, index)}
            onClose={closeSearch}
          />
        ) : null}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1">
        <div
          ref={historyRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5"
        >
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
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading older...
                  </>
                ) : (
                  <>
                    <ArrowUp className="size-4" />
                    Load older messages
                  </>
                )}
              </Button>
            </div>
          ) : null}

          {!isLoading && !error && emptyHistory ? (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 text-center sm:min-h-80">
              <div>
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MessageCircle className="size-6" aria-hidden="true" />
                </span>
                <p className="font-medium text-foreground">No messages yet</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Messages for this conversation will appear here once the chat
                  starts.
                </p>
              </div>
            </div>
          ) : null}

          {!isLoading && !error && messages.length > 0 ? (
            <MessageList
              messages={messages}
              currentUser={user}
              onMessageEdited={handleMessageEdited}
              onMessageDeleted={removeMessageById}
              canModerate={canModerate}
              canAttachFiles={canAttachFiles}
              onOpenProfile={setProfilePhoneNumber}
              receiptFor={receiptFor}
              showSenderAvatars={Boolean(group) || Boolean(topic)}
              highlightQuery={isSearchOpen ? searchedQuery : null}
              highlightMessageId={focusedMessage?.id ?? null}
              messageRefs={messageRefs}
            />
          ) : null}
        </div>

        {/* Only offered once the reader has actually left the end — a button
            that says "jump to latest" while you are looking at the latest is
            noise. */}
        <AnimatePresence>
          {!isLoading && !error && messages.length > 0 && !isAtBottom ? (
            <motion.div
              key="jump-to-latest"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={overlayTransition}
              className="absolute bottom-4 right-4 sm:bottom-5 sm:right-6"
            >
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10 rounded-full shadow-lg shadow-black/40 backdrop-blur-sm"
                aria-label="Jump to the newest message"
                title="Jump to latest"
                onClick={() => scrollToBottom("smooth")}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {error ? null : isTopicLocked ? (
        // A composer that only rejects on submit is worse than no composer:
        // say who can post here, and leave the reading experience alone.
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-black/20 px-3 py-4 text-sm text-muted-foreground sm:px-6">
          <Lock className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <p>
            Only admins can post in this topic. You can still read everything
            here.
          </p>
        </div>
      ) : (
        <MessageComposer
          chatId={chatId}
          disabled={isLoading || Boolean(error)}
          conversationLabel={headerTitle}
          canAttachFiles={canAttachFiles}
          onMessageSent={handleMessageSent}
        />
      )}

      {group ? (
        <GroupInfoDialog
          open={isGroupInfoOpen}
          groupId={group.id}
          onClose={() => setIsGroupInfoOpen(false)}
          onGroupChanged={onGroupChanged}
          onGroupDeleted={onGroupDeleted}
          onOpenProfile={setProfilePhoneNumber}
        />
      ) : null}

      {/* One dialog for the whole conversation rather than one per bubble. */}
      {profilePhoneNumber ? (
        <UserProfileDialog
          open
          phoneNumber={profilePhoneNumber}
          onClose={() => setProfilePhoneNumber(null)}
        />
      ) : null}
    </section>
  );
}

export default ChatPage;
