import { Check, FileText, Paperclip, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { editMessage } from "../../api/chats";
import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import { formatFileSize, formatMessageTimestamp, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import AttachmentLink from "./AttachmentLink";
import { Button } from "../ui/button";

type MessageItemProps = {
  message: ChatMessage;
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
  isHighlighted?: boolean;
  itemRef?: (node: HTMLLIElement | null) => void;
};

/** Attachment chip shared by the "new file" and "existing file" edit states. */
function AttachmentChip({
  name,
  size,
  disabled,
  removeLabel,
  onRemove,
}: {
  name: string;
  size: number | null;
  disabled: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex max-w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground/80">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{name}</span>
          {size != null ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {formatFileSize(size)}
            </span>
          ) : null}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        disabled={disabled}
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function MessageItem({
  message,
  currentUser,
  onMessageEdited,
  isHighlighted = false,
  itemRef,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const isOwnMessage =
    Boolean(currentUser?.phone_number) &&
    message.sender?.phone_number === currentUser?.phone_number;

  useEffect(() => {
    if (!isEditing) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    // Land the caret at the end rather than selecting the whole message.
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing]);

  const willHaveFile = Boolean(
    selectedFile || (message.attachment && !removeFile)
  );
  const canSave = Boolean(editContent.trim()) || willHaveFile;

  function cancelEditing() {
    setIsEditing(false);
    setEditContent(message.content);
    setSelectedFile(null);
    setRemoveFile(false);
    setError("");
  }

  async function handleSave() {
    const trimmed = editContent.trim();
    if (!canSave) {
      setError("Message must have content or an attachment.");
      return;
    }

    if (trimmed === message.content && !selectedFile && !removeFile) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const updatedMessage = await editMessage(
        message.chat,
        message.id,
        trimmed,
        selectedFile ?? undefined,
        removeFile
      );
      onMessageEdited(updatedMessage);
      setIsEditing(false);
      setSelectedFile(null);
      setRemoveFile(false);
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
      cancelEditing();
    }
  }

  return (
    <li
      ref={itemRef}
      className={cn(
        "group flex scroll-mt-24",
        isOwnMessage ? "justify-end" : "justify-start"
      )}
    >
      <article
        className={cn(
          "relative max-w-[min(34rem,100%)] rounded-2xl border px-3 py-2.5 shadow-lg transition-shadow sm:px-4 sm:py-3",
          isOwnMessage
            ? "bg-brand-gradient rounded-tr-sm border-transparent text-white shadow-primary/25"
            : "rounded-tl-sm border-border bg-white/[0.04] text-foreground shadow-black/20",
          isHighlighted &&
            "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            className={cn(
              "text-sm font-semibold",
              isOwnMessage ? "text-white" : "text-foreground"
            )}
          >
            {isOwnMessage ? "You" : personDisplayName(message.sender)}
          </p>
          <div className="flex items-center gap-2">
            <time
              dateTime={message.sent_at}
              className={cn(
                "text-xs",
                isOwnMessage ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {formatMessageTimestamp(message.sent_at)}
            </time>
            {message.is_edited ? (
              <span
                className={cn(
                  "text-xs italic",
                  isOwnMessage ? "text-white/60" : "text-muted-foreground/60"
                )}
              >
                (edited)
              </span>
            ) : null}
          </div>

          {isOwnMessage && !isEditing ? (
            // Sits in the meta row rather than floating outside the bubble: a
            // hover-only control pinned to a corner is unreachable on touch and
            // clips against the edge of a narrow viewport.
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label="Edit message"
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-lg text-white/70 opacity-100 transition hover:bg-white/15 hover:text-white focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none lg:opacity-0 lg:group-hover:opacity-100"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            {selectedFile ? (
              <AttachmentChip
                name={selectedFile.name}
                size={selectedFile.size}
                disabled={isSaving}
                removeLabel="Remove selected file"
                onRemove={() => {
                  setSelectedFile(null);
                  setRemoveFile(false);
                }}
              />
            ) : message.attachment && !removeFile ? (
              <AttachmentChip
                name={message.attachment.name}
                size={message.attachment.size}
                disabled={isSaving}
                removeLabel="Remove existing attachment"
                onRemove={() => setRemoveFile(true)}
              />
            ) : (
              <div className="flex items-center">
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  className="sr-only"
                  disabled={isSaving}
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    if (!nextFile) return;
                    setSelectedFile(nextFile);
                    // Uploading while one is attached replaces it, which the
                    // API expresses as "drop the old one and take this".
                    setRemoveFile(Boolean(message.attachment));
                    setError("");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "h-7 text-xs",
                    isOwnMessage &&
                      "border-white/20 bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <Paperclip className="size-3" aria-hidden="true" />
                  Attach file
                </Button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={editContent}
              disabled={isSaving}
              className={cn(
                "min-h-11 min-w-0 resize-y rounded-xl border px-3 py-2 text-sm leading-5 shadow-sm outline-none transition focus-visible:ring-[3px] disabled:opacity-60",
                isOwnMessage
                  ? "border-white/20 bg-black/20 text-white placeholder:text-white/50 focus-visible:border-white focus-visible:ring-white/30"
                  : "border-input bg-white/[0.04] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/40"
              )}
              onChange={(event) => {
                setEditContent(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={handleKeyDown}
            />

            {error ? (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant={isOwnMessage ? "secondary" : "outline"}
                className={cn(
                  "h-7 text-xs",
                  isOwnMessage && "border-0 bg-white/20 text-white hover:bg-white/30"
                )}
                disabled={isSaving}
                onClick={cancelEditing}
              >
                <X className="size-3" aria-hidden="true" />
                Cancel
              </Button>
              <Button
                size="sm"
                className={cn(
                  "h-7 text-xs",
                  isOwnMessage && "bg-white text-primary hover:bg-white/90"
                )}
                disabled={isSaving || !canSave}
                onClick={handleSave}
              >
                <Check className="size-3" aria-hidden="true" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>

            <p
              className={cn(
                "text-[10px]",
                isOwnMessage ? "text-white/60" : "text-muted-foreground/60"
              )}
            >
              escape to cancel • enter to save
            </p>
          </div>
        ) : (
          <>
            {message.content ? (
              <p
                className={cn(
                  "mt-2 text-sm leading-6 break-words whitespace-pre-wrap",
                  isOwnMessage ? "text-white/95" : "text-foreground/80"
                )}
              >
                {message.content}
              </p>
            ) : null}

            {message.attachment ? (
              <AttachmentLink attachment={message.attachment} />
            ) : null}
          </>
        )}
      </article>
    </li>
  );
}

export default MessageItem;
