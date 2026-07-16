import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MessageComposer from "../components/chat/MessageComposer";
import MessageList from "../components/chat/MessageList";
import { Skeleton } from "../components/ui/skeleton";
import { useAuth } from "../context/AuthContext";
import { getChatMessages } from "../api/chats";
import type { ChatMessage } from "../types/chat";

type ChatPageProps = {
  chatId: number;
  title?: string;
  subtitle?: string;
};

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

function ChatPage({ chatId, title, subtitle }: ChatPageProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fallbackTitle = useMemo(() => `Chat #${chatId}`, [chatId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      setIsLoading(true);
      setError("");

      try {
        const nextMessages = await getChatMessages(chatId);
        if (isCurrent) setMessages(nextMessages);
      } catch (err) {
        if (isCurrent) {
          setMessages([]);
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

  function handleMessageSent(message: ChatMessage) {
    setMessages((currentMessages) => {
      if (currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
        return currentMessages;
      }
      return [...currentMessages, message];
    });
  }

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
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
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

        {!isLoading && !error && messages.length === 0 ? (
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
          <MessageList messages={messages} currentUser={user} />
        ) : null}
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
