import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, FileText, Paperclip, Send, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  scheduleTextMessage,
  sendMediaMessage,
  sendTextMessage,
} from "../../api/chats";
import type { ChatMessage } from "../../types/chat";
import { overlayTransition } from "@/components/motion/transitions";
import { useNow } from "@/hooks/useNow";
import { HOUR_MS, ceilToMinutes, formatDeliveryMoment } from "@/lib/datetime";
import { formatFileSize } from "@/lib/format";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { ScheduleMessageDialog } from "./ScheduleMessageDialog";

type MessageComposerProps = {
  chatId: number;
  disabled?: boolean;
  conversationLabel: string;
  /** Groups start with media off; only the owner can turn it on. */
  canAttachFiles?: boolean;
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
      for (const field of ["content", "file", "scheduled_at"] as const) {
        const fieldError = data[field];
        if (Array.isArray(fieldError) && typeof fieldError[0] === "string") {
          return fieldError[0];
        }
      }
      if (typeof data.detail === "string") return data.detail;
    }

    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Could not send your message. Please try again.";
}

/** Opening the picker on a real value beats an empty field the user must fill. */
function defaultScheduleTime() {
  return ceilToMinutes(new Date(Date.now() + HOUR_MS), 1);
}

function MessageComposer({
  chatId,
  disabled = false,
  conversationLabel,
  canAttachFiles = true,
  onMessageSent,
}: MessageComposerProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // A chosen delivery time goes stale on its own; re-check it on a clock rather
  // than only when something else in the composer changes.
  const now = useNow(15_000);

  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  // Captured once per open so the picker has a stable value to reset from.
  const [pickerSeed, setPickerSeed] = useState<Date>(defaultScheduleTime);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isScheduleMode = scheduledAt !== null;
  const trimmedContent = content.trim();
  const canSend = isScheduleMode
    ? Boolean(trimmedContent) &&
      scheduledAt.getTime() > now.getTime() &&
      !isSending &&
      !disabled
    : (Boolean(trimmedContent) || Boolean(selectedFile)) && !isSending && !disabled;
  const statusText = isScheduleMode
    ? "Scheduling..."
    : selectedFile
      ? "Uploading..."
      : "Sending...";

  function clearFeedback() {
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSend) return;

    setIsSending(true);
    clearFeedback();

    try {
      if (isScheduleMode) {
        await scheduleTextMessage(
          chatId,
          trimmedContent,
          scheduledAt.toISOString()
        );
        setSuccess(`Scheduled — sends ${formatDeliveryMoment(scheduledAt)}.`);
        setScheduledAt(null);
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

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openPicker() {
    setPickerSeed(scheduledAt ?? defaultScheduleTime());
    setIsPickerOpen(true);
  }

  function handleScheduleButton() {
    clearFeedback();
    // A second press on an armed composer cancels; otherwise open the picker.
    if (isScheduleMode) {
      setScheduledAt(null);
      return;
    }
    openPicker();
  }

  return (
    <>
      <form
        className="border-t border-border bg-black/20 px-3 py-3 sm:px-6 sm:py-4"
        onSubmit={handleSubmit}
      >
        <AnimatePresence initial={false}>
          {selectedFile ? (
            <motion.div
              key="attachment"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={overlayTransition}
              className="overflow-hidden"
            >
              <div className="mb-3 flex max-w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground/80">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {selectedFile.name}
                    </span>
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
            </motion.div>
          ) : null}

          {scheduledAt ? (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={overlayTransition}
              className="overflow-hidden"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-primary/25 bg-primary/[0.08] px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate">
                    Sends {formatDeliveryMoment(scheduledAt, now)}
                  </span>
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSending || disabled}
                    onClick={openPicker}
                  >
                    Change
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={isSending || disabled}
                    aria-label="Cancel scheduling"
                    onClick={() => {
                      setScheduledAt(null);
                      clearFeedback();
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex items-end gap-2 sm:gap-3">
          {canAttachFiles ? (
            <>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                className="sr-only"
                disabled={disabled || isSending}
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null);
                  setError("");
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10 shrink-0"
                disabled={disabled || isSending}
                aria-label="Attach file"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant={isScheduleMode ? "default" : "outline"}
            size="icon"
            className="size-10 shrink-0"
            disabled={disabled || isSending || Boolean(selectedFile)}
            aria-label={isScheduleMode ? "Cancel scheduling" : "Schedule message"}
            aria-pressed={isScheduleMode}
            title={
              selectedFile
                ? "Attachments cannot be scheduled"
                : "Schedule this message"
            }
            onClick={handleScheduleButton}
          >
            <CalendarClock className="size-4" aria-hidden="true" />
          </Button>

          <Textarea
            value={content}
            rows={1}
            disabled={disabled || isSending}
            placeholder={
              isScheduleMode
                ? "Write the message to send later"
                : selectedFile
                  ? "Add an optional caption"
                  : "Message this chat"
            }
            // Grows with the draft up to a ceiling, then scrolls inside itself
            // rather than pushing the conversation off screen.
            className="max-h-36 min-h-10 flex-1 sm:px-4 sm:py-3"
            onChange={(event) => {
              setContent(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
          />
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0"
            disabled={!canSend}
            aria-label={
              isSending
                ? statusText
                : isScheduleMode
                  ? "Schedule message"
                  : "Send message"
            }
          >
            {isScheduleMode ? (
              <CalendarClock className="size-4" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
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

      <ScheduleMessageDialog
        open={isPickerOpen}
        conversationLabel={conversationLabel}
        initialValue={pickerSeed}
        disabled={isSending}
        onCancel={() => setIsPickerOpen(false)}
        onConfirm={(value) => {
          setScheduledAt(value);
          setIsPickerOpen(false);
          clearFeedback();
        }}
      />
    </>
  );
}

export default MessageComposer;
