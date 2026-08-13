import type { MutableRefObject } from "react";
import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import MessageItem from "./MessageItem";

type MessageListProps = {
  messages: ChatMessage[];
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
  highlightMessageId?: number | null;
  messageRefs?: MutableRefObject<Record<number, HTMLLIElement | null>>;
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
            if (messageRefs) {
              messageRefs.current[message.id] = node;
            }
          }}
        />
      ))}
    </ul>
  );
}

export default MessageList;
