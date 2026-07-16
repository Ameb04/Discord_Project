import { ArrowLeft, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getChatMessages } from "../api/chats";
import MessageList from "../components/chat/MessageList";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useAuth } from "../context/AuthContext";
import type { ChatMessage } from "../types/chat";

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

function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const parsedChatId = useMemo(() => {
    if (!chatId) return null;
    const numericChatId = Number(chatId);
    if (!Number.isInteger(numericChatId) || numericChatId <= 0) return null;
    return numericChatId;
  }, [chatId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadMessages() {
      if (parsedChatId === null) {
        setMessages([]);
        setError("Invalid chat.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const nextMessages = await getChatMessages(parsedChatId);
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
  }, [parsedChatId]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-5xl flex-col px-6 py-8 sm:px-8 lg:py-10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/search">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Search
          </Link>
        </Button>

        <span className="text-xs text-white/40">
          {parsedChatId ? `Chat #${parsedChatId}` : "Chat"}
        </span>
      </div>

      <section className="flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30">
        <header className="flex items-center gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
            <MessageCircle className="size-5 text-white/65" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white">Chat</h1>
            <p className="mt-1 text-sm text-white/45">
              {isLoading
                ? "Loading messages..."
                : `${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
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
              className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-100/80"
            >
              {error}
            </div>
          ) : null}

          {!isLoading && !error && messages.length === 0 ? (
            <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
              <div>
                <p className="font-medium text-white/80">No messages yet</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-white/45">
                  Messages for this chat will appear here once the conversation starts.
                </p>
              </div>
            </div>
          ) : null}

          {!isLoading && !error && messages.length > 0 ? (
            <MessageList messages={messages} currentUser={user} />
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default ChatPage;
