import { Check, CheckCheck, FileText, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { deleteMessage, editMessage } from "../../api/chats";
import type { ChatMessage, MessageReceipt } from "../../types/chat";
import type { User } from "../../types/user";
import { overlayTransition } from "@/components/motion/transitions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  formatFileSize,
  formatMessageTimestamp,
  initialsFor,
  personDisplayName,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import AttachmentLink from "./AttachmentLink";
import { HighlightedText } from "./HighlightedText";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Textarea } from "../ui/textarea";

type MessageItemProps = {
  message: ChatMessage;
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
  onMessageDeleted: (messageId: number) => void;
  /**
   * Whether the viewer moderates this conversation — a group owner, who may
   * delete anyone's message. Deliberately does not extend to editing: nobody
   * gets to rewrite someone else's words.
   */
  canModerate?: boolean;
  /** Attaching files is off in groups until the owner enables media. */
  canAttachFiles?: boolean;
  /** Opens the sender's profile. The dialog itself lives with the chat, so a
   *  long conversation does not mount one per message. */
  onOpenProfile?: (phoneNumber: string) => void;
  /** How many other participants have read this message, and whether all have. */
  receipt?: MessageReceipt;
  /**
   * Put the sender's picture beside their bubble — on in groups, where "who
   * said this" is the question every message has to answer, and off in a
   * direct chat, where there are only two possible answers.
   */
  showSenderAvatar?: boolean;
  /** Active search term, marked inside the message text. */
  highlightQuery?: string | null;
  isHighlighted?: boolean;
  itemRef?: (node: HTMLLIElement | null) => void;
};

function extractMessageActionError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { status?: number; data?: { detail?: unknown } };
    };
    if (typeof maybeAxiosError.response?.data?.detail === "string") {
      return maybeAxiosError.response.data.detail;
    }
    if (maybeAxiosError.response?.status === 403) {
      return "You do not have permission to do that.";
    }
  }
  return fallback;
}

/**
 * A message action in the meta row.
 *
 * Hidden until hover on pointer devices, always visible below `lg` — there is
 * no hover on a touch screen, so a hover-only control would be unreachable.
 */
const actionButtonClass =
  "grid size-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none lg:opacity-0 lg:group-hover:opacity-100";

/** The same control on the gradient bubble, where muted greys would vanish. */
const ownActionButtonClass =
  "text-white/70 hover:bg-white/15 hover:text-white focus-visible:ring-white/40";

/**
 * Delivery ticks, in the shape everyone already reads: one check means it left
 * here, two mean somebody opened it.
 *
 * In a group the two-check state is dimmed until *everyone* has read it, so
 * "some people have seen this" and "everyone has" stay distinguishable. The
 * label carries the count, since colour alone would not.
 */
function ReceiptTicks({ receipt }: { receipt: MessageReceipt }) {
  const { seenByCount, seenByAll } = receipt;

  const label =
    seenByCount === 0
      ? "Sent"
      : seenByAll
        ? "Seen by everyone"
        : `Seen by ${seenByCount}`;

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center",
        seenByAll ? "text-sky-200" : "text-white/60"
      )}
    >
      {seenByCount > 0 ? (
        <CheckCheck className="size-3.5" aria-hidden="true" />
      ) : (
        <Check className="size-3.5" aria-hidden="true" />
      )}
    </span>
  );
}

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
  onMessageDeleted,
  canModerate = false,
  canAttachFiles = true,
  onOpenProfile,
  receipt,
  showSenderAvatar = false,
  highlightQuery,
  isHighlighted = false,
  itemRef,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const senderPhoneNumber = message.sender?.phone_number;
  const senderName = personDisplayName(message.sender);
  const isOwnMessage =
    Boolean(currentUser?.phone_number) &&
    senderPhoneNumber === currentUser?.phone_number;
  const openSenderProfile =
    !isOwnMessage && senderPhoneNumber && onOpenProfile
      ? () => onOpenProfile(senderPhoneNumber)
      : null;
  // Authors edit their own words; owners moderate by removing, not rewriting.
  const canEdit = isOwnMessage;
  const canDelete = isOwnMessage || canModerate;

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
    } catch (err) {
      setError(extractMessageActionError(err, "Failed to edit message."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteMessage(message.chat, message.id);
      // The socket also announces this, but the sender should not have to wait
      // for a round trip through the channel layer to see their own action.
      onMessageDeleted(message.id);
      setIsConfirmingDelete(false);
    } catch (err) {
      setDeleteError(
        extractMessageActionError(err, "Failed to delete message.")
      );
    } finally {
      setIsDeleting(false);
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

  const senderAvatar = showSenderAvatar && !isOwnMessage ? (
    <Avatar className="size-9 border border-border">
      {message.sender?.avatar_url ? (
        <AvatarImage src={message.sender.avatar_url} alt={senderName} />
      ) : null}
      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-foreground">
        {initialsFor(senderName)}
      </AvatarFallback>
    </Avatar>
  ) : null;

  return (
    <li
      ref={itemRef}
      className={cn(
        "group flex scroll-mt-24 items-end gap-2",
        isOwnMessage ? "justify-end" : "justify-start"
      )}
    >
      {/* Bottom-aligned, so a tall bubble grows away from the picture and the
          two stay visually joined at the message's last line. */}
      {senderAvatar ? (
        openSenderProfile ? (
          <button
            type="button"
            onClick={openSenderProfile}
            aria-label={`View ${senderName}'s profile`}
            className="shrink-0 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {senderAvatar}
          </button>
        ) : (
          <span className="shrink-0">{senderAvatar}</span>
        )
      ) : null}

      <article
        className={cn(
          "relative min-w-0 max-w-[34rem] rounded-2xl border px-3 py-2.5 shadow-lg transition-shadow sm:px-4 sm:py-3",
          isOwnMessage
            ? "bg-brand-gradient rounded-tr-sm border-transparent text-white shadow-primary/25"
            : "rounded-tl-sm border-border bg-white/[0.04] text-foreground shadow-black/20"
        )}
      >
        {/* The search hit reads as a wash over the bubble rather than a border
            swap, so the bubble keeps its own colour and the two states are
            distinguishable at a glance while stepping through matches. */}
        <AnimatePresence>
          {isHighlighted ? (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-amber-300/15 ring-2 ring-amber-300/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
            />
          ) : null}
        </AnimatePresence>

        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Someone else's name opens their profile; your own has nothing to
              reveal that you cannot already see in settings. */}
          {openSenderProfile ? (
            <button
              type="button"
              onClick={openSenderProfile}
              className="rounded text-sm font-semibold text-foreground underline-offset-4 outline-none transition-colors hover:text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {senderName}
            </button>
          ) : (
            <p
              className={cn(
                "text-sm font-semibold",
                isOwnMessage ? "text-white" : "text-foreground"
              )}
            >
              {isOwnMessage ? "You" : senderName}
            </p>
          )}
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
            {isOwnMessage && receipt ? <ReceiptTicks receipt={receipt} /> : null}
          </div>

          {!isEditing && (canEdit || canDelete) ? (
            // Sits in the meta row rather than floating outside the bubble: a
            // hover-only control pinned to a corner is unreachable on touch and
            // clips against the edge of a narrow viewport.
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit message"
                  className={cn(actionButtonClass, isOwnMessage && ownActionButtonClass)}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setIsConfirmingDelete(true);
                  }}
                  aria-label={
                    isOwnMessage
                      ? "Delete message"
                      : `Delete message from ${senderName}`
                  }
                  className={cn(
                    actionButtonClass,
                    isOwnMessage ? ownActionButtonClass : "hover:text-red-300"
                  )}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isEditing ? (
          <div className="relative mt-2 flex flex-col gap-2">
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
            ) : canAttachFiles ? (
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
            ) : null}

            <Textarea
              ref={textareaRef}
              value={editContent}
              disabled={isSaving}
              className={cn(
                "max-h-48 min-h-11",
                isOwnMessage &&
                  "border-white/20 bg-black/20 text-white placeholder:text-white/50 focus-visible:border-white focus-visible:bg-black/20 focus-visible:ring-white/30"
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
          <div className="relative">
            {message.content ? (
              <p
                className={cn(
                  "mt-2 text-sm leading-6 break-words whitespace-pre-wrap",
                  isOwnMessage ? "text-white/95" : "text-foreground/80"
                )}
              >
                <HighlightedText
                  text={message.content}
                  query={highlightQuery}
                />
              </p>
            ) : null}

            {message.attachment ? (
              <AttachmentLink attachment={message.attachment} />
            ) : null}
          </div>
        )}
      </article>

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete message?"
        description={
          isOwnMessage
            ? "This removes the message for everyone in the conversation."
            : `This removes ${senderName}'s message for everyone.`
        }
        confirmLabel="Delete message"
        pendingLabel="Deleting..."
        isPending={isDeleting}
        error={deleteError}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() => void handleDelete()}
      >
        {message.content || message.attachment ? (
          <blockquote className="rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm">
            {message.content ? (
              <p className="line-clamp-4 leading-6 break-words whitespace-pre-wrap text-foreground/80">
                {message.content}
              </p>
            ) : null}
            {message.attachment ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{message.attachment.name}</span>
              </p>
            ) : null}
          </blockquote>
        ) : null}
      </ConfirmDialog>
    </li>
  );
}

export default MessageItem;
