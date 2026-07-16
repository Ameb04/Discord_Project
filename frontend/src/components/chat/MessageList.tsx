import type { ChatMessage } from "../../types/chat";
import type { User } from "../../types/user";
import AttachmentLink from "./AttachmentLink";

type MessageListProps = {
  messages: ChatMessage[];
  currentUser: User | null;
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

function MessageList({ messages, currentUser }: MessageListProps) {
  return (
    <ul className="grid gap-4">
      {messages.map((message) => {
        const isOwnMessage =
          Boolean(currentUser?.phone_number) &&
          message.sender?.phone_number === currentUser?.phone_number;

        return (
          <li
            key={message.id}
            className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
          >
            <article
              className={`max-w-[min(34rem,100%)] rounded-2xl border px-4 py-3 shadow-lg ${
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
                <time
                  dateTime={message.sent_at}
                  className={`text-xs ${
                    isOwnMessage ? "text-white/70" : "text-muted-foreground"
                  }`}
                >
                  {formatSentAt(message.sent_at)}
                </time>
              </div>

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
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export default MessageList;
