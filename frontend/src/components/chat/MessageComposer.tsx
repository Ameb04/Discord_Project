import { CalendarClock, FileText, Paperclip, Send, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  scheduleTextMessage,
  sendMediaMessage,
  sendTextMessage,
} from "../../api/chats";
import type { ChatMessage } from "../../types/chat";
import { Button } from "../ui/button";

type MessageComposerProps = {
  chatId: number;
  disabled?: boolean;
  conversationLabel: string;
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
      const fileError = data.file;
      if (Array.isArray(fileError) && typeof fileError[0] === "string") {
        return fileError[0];
      }
      const scheduledAtError = data.scheduled_at;
      if (Array.isArray(scheduledAtError) && typeof scheduledAtError[0] === "string") {
        return scheduledAtError[0];
      }
      const detail = data.detail;
      if (typeof detail === "string") return detail;
    }

    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Could not send your message. Please try again.";
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function minimumLocalScheduleTime() {
  const date = new Date(Date.now() + 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function MessageComposer({
  chatId,
  disabled = false,
  conversationLabel,
  onMessageSent,
}: MessageComposerProps) {
  const fileInputId = useId();
  const scheduleInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const trimmedContent = content.trim();
  const canSend = isScheduleMode
    ? Boolean(trimmedContent) && Boolean(scheduledAt) && !isSending && !disabled
    : (Boolean(trimmedContent) || Boolean(selectedFile)) && !isSending && !disabled;
  const statusText = isScheduleMode
    ? "Scheduling..."
    : selectedFile
      ? "Uploading..."
      : "Sending...";

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSend) return;

    setIsSending(true);
    setError("");
    setSuccess("");

    try {
      if (isScheduleMode) {
        const localDate = new Date(scheduledAt);
        if (Number.isNaN(localDate.getTime())) {
          throw new Error("Choose a valid delivery time.");
        }
        await scheduleTextMessage(chatId, trimmedContent, localDate.toISOString());
        setSuccess("Message scheduled for this conversation.");
        setScheduledAt("");
      } else {
        const message = selectedFile
          ? await sendMediaMessage(chatId, selectedFile, trimmedContent)
          : await sendTextMessage(chatId, trimmedContent);
        onMessageSent(message);
      }
      setContent("");
      clearSelectedFile();
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

  function handleFileChange(fileList: FileList | null) {
    const nextFile = fileList?.[0] ?? null;
    setSelectedFile(nextFile);
    if (error) setError("");
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <form
      className="border-t border-border bg-black/20 px-5 py-4 sm:px-6"
      onSubmit={handleSubmit}
    >
      {selectedFile ? (
        <div className="mb-3 flex max-w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground/80">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{selectedFile.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </span>
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSending || disabled}
            aria-label="Remove selected file"
            onClick={clearSelectedFile}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {isScheduleMode ? (
        <div className="mb-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Schedule for {conversationLabel}
          </p>
          <label
            htmlFor={scheduleInputId}
            className="mt-3 block text-xs font-medium text-muted-foreground"
          >
            Local delivery date and time
          </label>
          <input
            id={scheduleInputId}
            type="datetime-local"
            value={scheduledAt}
            min={minimumLocalScheduleTime()}
            disabled={disabled || isSending}
            className="mt-1.5 h-10 w-full rounded-xl border border-input bg-black/20 px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            onChange={(event) => {
              setScheduledAt(event.target.value);
              setError("");
              setSuccess("");
            }}
          />
        </div>
      ) : null}

      <div className="flex items-end gap-3">
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="sr-only"
          disabled={disabled || isSending}
          onChange={(event) => handleFileChange(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || isSending}
          aria-label="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={isScheduleMode ? "default" : "outline"}
          size="icon"
          disabled={disabled || isSending || Boolean(selectedFile)}
          aria-label={isScheduleMode ? "Cancel scheduling" : "Schedule message"}
          onClick={() => {
            setIsScheduleMode((current) => !current);
            setScheduledAt("");
            setError("");
            setSuccess("");
          }}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
        </Button>

        <textarea
          value={content}
          rows={1}
          disabled={disabled || isSending}
          placeholder={selectedFile ? "Add an optional caption" : "Message this chat"}
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
          aria-label={isSending ? statusText : "Send message"}
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {isSending ? (
        <p className="mt-3 text-sm text-muted-foreground">{statusText}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-100/80">
          {error}
        </p>
      ) : null}

      {success ? (
        <p role="status" className="mt-3 text-sm text-emerald-200/80">
          {success}
        </p>
      ) : null}
    </form>
  );
}

export default MessageComposer;
