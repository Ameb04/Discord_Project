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
              className={`max-w-[min(34rem,100%)] rounded-2xl border px-4 py-3 shadow-lg shadow-black/20 ${
                isOwnMessage
                  ? "border-white/20 bg-white text-black"
                  : "border-white/10 bg-white/[0.04] text-white"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p
                  className={`text-sm font-semibold ${
                    isOwnMessage ? "text-black" : "text-white"
                  }`}
                >
                  {isOwnMessage ? "You" : displayName(message)}
                </p>
                <time
                  dateTime={message.sent_at}
                  className={`text-xs ${
                    isOwnMessage ? "text-black/50" : "text-white/40"
                  }`}
                >
                  {formatSentAt(message.sent_at)}
                </time>
              </div>

              {message.content ? (
                <p
                  className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${
                    isOwnMessage ? "text-black/85" : "text-white/75"
                  }`}
                >
                  {message.content}
                </p>
              ) : null}

              {message.attachment ? (
                <div className={isOwnMessage ? "[&_a]:border-black/10 [&_a]:bg-black/[0.04] [&_a]:text-black/75 [&_a:hover]:bg-black/[0.08] [&_svg]:text-black/45 [&_span_span:first-child]:text-black [&_span_span:last-child]:text-black/45" : ""}>
                  <AttachmentLink attachment={message.attachment} />
                </div>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export default MessageList;
