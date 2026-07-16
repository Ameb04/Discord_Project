import { Send } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { sendTextMessage } from "../../api/chats";
import type { ChatMessage } from "../../types/chat";
import { Button } from "../ui/button";

type MessageComposerProps = {
  chatId: number;
  disabled?: boolean;
  onMessageSent: (message: ChatMessage) => void;
};

function extractSendError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { status?: number; data?: Record<string, unknown> };
      message?: string;
    };

    if (maybeAxiosError.response?.status === 403) {
      return "You do not have permission to send messages here.";
    }
    if (maybeAxiosError.response?.status === 404) {
      return "This chat could not be found.";
    }

    const data = maybeAxiosError.response?.data;
    if (data) {
      const contentError = data.content;
      if (Array.isArray(contentError) && typeof contentError[0] === "string") {
        return contentError[0];
      }
      const detail = data.detail;
      if (typeof detail === "string") return detail;
    }

    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Could not send your message. Please try again.";
}

function MessageComposer({ chatId, disabled = false, onMessageSent }: MessageComposerProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const trimmedContent = content.trim();
  const canSend = Boolean(trimmedContent) && !isSending && !disabled;

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSend) return;

    setIsSending(true);
    setError("");

    try {
      const message = await sendTextMessage(chatId, trimmedContent);
      onMessageSent(message);
      setContent("");
    } catch (err) {
      setError(extractSendError(err));
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form
      className="border-t border-white/10 bg-black/15 px-5 py-4 sm:px-6"
      onSubmit={handleSubmit}
    >
      <div className="flex items-end gap-3">
        <textarea
          value={content}
          rows={1}
          disabled={disabled || isSending}
          placeholder="Message this chat"
          className="min-h-11 max-h-36 min-w-0 flex-1 resize-y rounded-xl border border-input bg-white/[0.04] px-4 py-3 text-sm leading-5 text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:bg-white/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          aria-label={isSending ? "Sending message" : "Send message"}
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-100/80">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export default MessageComposer;
