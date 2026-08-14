import { websocketBaseUrl } from "./chatSocket";
import type {
  MessageNotification,
  NotificationConversation,
  NotificationConversationType,
} from "../types/notification";
import type { PublicUser } from "../types/user";

const CONVERSATION_TYPES: NotificationConversationType[] = [
  "direct",
  "group",
  "topic",
  "chat",
];

/**
 * The socket carrying everything the signed-in person should be told about.
 *
 * One per session rather than one per conversation: a notification exists for
 * rooms that are *not* open, so it cannot ride a socket that only exists while
 * one is.
 */
export function notificationWebSocketUrl(): string {
  return `${websocketBaseUrl()}/notifications/`;
}

/**
 * Decode one notification frame, or null when it is not a shape we recognise.
 *
 * Validated rather than cast, for the same reason the chat socket validates:
 * this is the one input the UI does not control, and a malformed frame must
 * not reach React state.
 */
export function parseMessageNotification(
  data: string
): MessageNotification | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (event.type !== "notification.message") return null;
  if (
    !Number.isInteger(event.chat) ||
    !Number.isInteger(event.message_id) ||
    typeof event.preview !== "string" ||
    typeof event.sent_at !== "string"
  ) {
    return null;
  }

  const conversation = parseConversation(event.conversation);
  if (!conversation) return null;

  return {
    chat: event.chat as number,
    messageId: event.message_id as number,
    conversation,
    // A message from a deleted account has no sender, which the rest of the
    // app already renders; anything else unrecognisable is dropped to null too.
    sender: parseSender(event.sender),
    preview: event.preview,
    sentAt: event.sent_at,
    // Absent is treated as "do not interrupt": the badge still moves, and a
    // frame we cannot read the verdict from must not start shouting.
    notify: event.notify === true,
  };
}

function parseConversation(value: unknown): NotificationConversation | null {
  if (typeof value !== "object" || value === null) return null;
  const conversation = value as Record<string, unknown>;

  if (
    !Number.isInteger(conversation.id) ||
    typeof conversation.title !== "string" ||
    typeof conversation.channel !== "string" ||
    !CONVERSATION_TYPES.includes(
      conversation.type as NotificationConversationType
    )
  ) {
    return null;
  }

  return {
    id: conversation.id as number,
    type: conversation.type as NotificationConversationType,
    title: conversation.title,
    channel: conversation.channel,
  };
}

function parseSender(value: unknown): PublicUser | null {
  if (typeof value !== "object" || value === null) return null;
  const sender = value as Record<string, unknown>;
  if (typeof sender.phone_number !== "string") return null;
  return sender as unknown as PublicUser;
}
