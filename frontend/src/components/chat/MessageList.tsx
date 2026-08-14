import { Fragment, type RefObject } from "react";

import type { ChatMessage, MessageReceipt } from "../../types/chat";
import type { User } from "../../types/user";
import MessageItem from "./MessageItem";

/**
 * The line marking where the reader stopped last time.
 *
 * A rule across the full width with the label centred on it — the shape that
 * reads as "everything below this is new" without needing to be read at all.
 * It stays put once drawn, even as the messages under it are marked read:
 * it answers "where was I", and that answer does not change while you are
 * still looking at the conversation.
 */
function UnreadDivider({
  itemRef,
}: {
  itemRef?: (node: HTMLLIElement | null) => void;
}) {
  return (
    <li
      ref={itemRef}
      // Not a separator role: it labels the messages after it, and screen
      // readers should hear the label rather than "separator".
      className="relative flex items-center gap-3 py-1 select-none"
    >
      <span className="h-px flex-1 bg-primary/35" aria-hidden="true" />
      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase">
        Unread messages
      </span>
      <span className="h-px flex-1 bg-primary/35" aria-hidden="true" />
    </li>
  );
}

type MessageListProps = {
  messages: ChatMessage[];
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
  onMessageDeleted: (messageId: number) => void;
  /** The viewer owns this group and may delete anyone's message. */
  canModerate?: boolean;
  /** Attachments are allowed here — off in groups until the owner opts in. */
  canAttachFiles?: boolean;
  onOpenProfile?: (phoneNumber: string) => void;
  /** Delivery state for one of the viewer's own messages, by message id. */
  receiptFor?: (message: ChatMessage) => MessageReceipt | undefined;
  /** Show each sender's picture beside their bubble — groups only. */
  showSenderAvatars?: boolean;
  /** Active search term, marked inside every message that contains it. */
  highlightQuery?: string | null;
  highlightMessageId?: number | null;
  messageRefs?: RefObject<Record<number, HTMLLIElement | null>>;
  /** Draw the "unread messages" line above this message. */
  unreadDividerMessageId?: number | null;
  /** Handed the divider element, so the caller can scroll it into view. */
  unreadDividerRef?: (node: HTMLLIElement | null) => void;
};

function MessageList({
  messages,
  currentUser,
  onMessageEdited,
  onMessageDeleted,
  canModerate = false,
  canAttachFiles = true,
  onOpenProfile,
  receiptFor,
  showSenderAvatars = false,
  highlightQuery = null,
  highlightMessageId = null,
  messageRefs,
  unreadDividerMessageId = null,
  unreadDividerRef,
}: MessageListProps) {
  return (
    <ul className="grid gap-4">
      {messages.map((message) => (
        <Fragment key={message.id}>
          {message.id === unreadDividerMessageId ? (
            <UnreadDivider itemRef={unreadDividerRef} />
          ) : null}
          <MessageItem
            message={message}
            currentUser={currentUser}
            onMessageEdited={onMessageEdited}
            onMessageDeleted={onMessageDeleted}
            canModerate={canModerate}
            canAttachFiles={canAttachFiles}
            onOpenProfile={onOpenProfile}
            receipt={receiptFor?.(message)}
            showSenderAvatar={showSenderAvatars}
            highlightQuery={highlightQuery}
            isHighlighted={highlightMessageId === message.id}
            itemRef={(node) => {
              if (!messageRefs) return;
              if (node) {
                messageRefs.current[message.id] = node;
              } else {
                // Drop the entry instead of leaving a null behind, so the map
                // does not grow for the lifetime of the conversation.
                delete messageRefs.current[message.id];
              }
            }}
          />
        </Fragment>
      ))}
    </ul>
  );
}

export default MessageList;
