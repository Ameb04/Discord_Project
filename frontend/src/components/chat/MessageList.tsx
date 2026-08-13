import type { RefObject } from "react";

import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import MessageItem from "./MessageItem";

type MessageListProps = {
  messages: ChatMessage[];
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
  highlightMessageId?: number | null;
  messageRefs?: RefObject<Record<number, HTMLLIElement | null>>;
};

function MessageList({
  messages,
  currentUser,
  onMessageEdited,
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
