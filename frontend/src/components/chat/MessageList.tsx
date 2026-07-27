import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import MessageItem from "./MessageItem";

type MessageListProps = {
  messages: ChatMessage[];
  currentUser: User | null;
  onMessageEdited: (message: ChatMessage) => void;
};

function MessageList({ messages, currentUser, onMessageEdited }: MessageListProps) {
  return (
    <ul className="grid gap-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          currentUser={currentUser}
          onMessageEdited={onMessageEdited}
        />
      ))}
    </ul>
  );
}

export default MessageList;
