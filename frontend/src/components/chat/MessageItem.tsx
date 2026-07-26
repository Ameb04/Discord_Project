import { Pencil, X, Check } from "lucide-react";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { editTextMessage } from "../../api/chats";
import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import AttachmentLink from "./AttachmentLink";
import { Button } from "../ui/button";

type MessageItemProps = {
  message: ChatMessage;
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
};

function displayName(message: ChatMessage) {
  if (!message.sender) return "Unknown user";
  const fullName = `${message.sender.first_name} ${message.sender.last_name}`.trim();
  return fullName || message.sender.phone_number;
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

function MessageItem({ message, currentUser, onMessageEdited }: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwnMessage =
    Boolean(currentUser?.phone_number) &&
    message.sender?.phone_number === currentUser?.phone_number;

  const canEdit = isOwnMessage && !message.attachment; // Usually, we might just restrict editing text messages

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to the end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  async function handleSave() {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setError("Message cannot be empty.");
      return;
    }

    if (trimmed === message.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const updatedMessage = await editTextMessage(message.chat, message.id, trimmed);
      onMessageEdited(updatedMessage);
      setIsEditing(false);
    } catch {
      setError("Failed to edit message.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsEditing(false);
      setEditContent(message.content);
      setError("");
    }
  }

  return (
    <li className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} group`}>
      <article
        className={`relative max-w-[min(34rem,100%)] rounded-2xl border px-4 py-3 shadow-lg ${
          isOwnMessage
            ? "bg-brand-gradient border-transparent text-white shadow-primary/25 rounded-tr-sm"
            : "border-border bg-white/[0.04] text-foreground shadow-black/20 rounded-tl-sm"
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={`text-sm font-semibold ${
              isOwnMessage ? "text-white" : "text-foreground"
            }`}
          >
            {isOwnMessage ? "You" : displayName(message)}
          </p>
          <div className="flex items-center gap-2">
            <time
              dateTime={message.sent_at}
              className={`text-xs ${
                isOwnMessage ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              {formatSentAt(message.sent_at)}
            </time>
            {message.is_edited && (
              <span className={`text-xs italic ${isOwnMessage ? "text-white/60" : "text-muted-foreground/60"}`}>
                (edited)
              </span>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={editContent}
              disabled={isSaving}
              className={`min-h-11 min-w-0 resize-y rounded-xl border border-input px-3 py-2 text-sm leading-5 shadow-sm outline-none transition focus-visible:ring-[3px] disabled:opacity-60 ${
                isOwnMessage
                  ? "bg-black/20 text-white placeholder:text-white/50 border-white/20 focus-visible:border-white focus-visible:ring-white/30"
                  : "bg-white/[0.04] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40"
              }`}
              onChange={(e) => {
                setEditContent(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={handleKeyDown}
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant={isOwnMessage ? "secondary" : "outline"}
                className={isOwnMessage ? "bg-white/20 hover:bg-white/30 text-white border-0 h-7 text-xs" : "h-7 text-xs"}
                disabled={isSaving}
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content);
                  setError("");
                }}
              >
                <X className="mr-1 size-3" /> Cancel
              </Button>
              <Button
                size="sm"
                className={isOwnMessage ? "bg-white text-primary hover:bg-white/90 h-7 text-xs" : "h-7 text-xs"}
                disabled={isSaving || !editContent.trim()}
                onClick={handleSave}
              >
                <Check className="mr-1 size-3" /> {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className={`text-[10px] ${isOwnMessage ? "text-white/60" : "text-muted-foreground/60"}`}>
              escape to cancel • enter to save
            </p>
          </div>
        ) : (
          <>
            {message.content ? (
              <p
                className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${
                  isOwnMessage ? "text-white/95" : "text-foreground/80"
                }`}
              >
                {message.content}
              </p>
            ) : null}

            {message.attachment ? (
              <AttachmentLink attachment={message.attachment} />
            ) : null}
          </>
        )}

        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className={`absolute -top-3 -right-3 rounded-full p-1.5 shadow-md opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
              isOwnMessage
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-card text-foreground hover:bg-accent border border-border"
            }`}
            aria-label="Edit message"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </article>
    </li>
  );
}

export default MessageItem;
