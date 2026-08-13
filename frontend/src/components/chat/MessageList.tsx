import type { RefObject } from "react";

import type { ChatMessage, MessageReceipt } from "../../types/chat";
import type { User } from "../../types/user";
import MessageItem from "./MessageItem";

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
  highlightMessageId?: number | null;
  messageRefs?: RefObject<Record<number, HTMLLIElement | null>>;
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
  highlightMessageId = null,
  messageRefs,
}: MessageListProps) {
  return (
    <ul className="grid gap-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          currentUser={currentUser}
          onMessageEdited={onMessageEdited}
          onMessageDeleted={onMessageDeleted}
          canModerate={canModerate}
          canAttachFiles={canAttachFiles}
          onOpenProfile={onOpenProfile}
          receipt={receiptFor?.(message)}
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
      ))}
    </ul>
  );
}

export default MessageList;
