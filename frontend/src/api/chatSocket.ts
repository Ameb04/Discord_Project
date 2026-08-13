import type { ChatMessage } from "../types/chat";

/** A message arrived or changed — the payload is the message's current state. */
export type LiveMessageCreated = {
  type: "message.created";
  message: ChatMessage;
};

/** A message was removed; only the ids travel, since the row is already gone. */
export type LiveMessageDeleted = {
  type: "message.deleted";
  chat: number;
  messageId: number;
};

/** One participant's read watermark moved, so receipts need recomputing. */
export type LiveChatRead = {
  type: "chat.read";
  chat: number;
  reader: string;
  lastReadMessageId: number;
};

export type LiveChatEvent =
  | LiveMessageCreated
  | LiveMessageDeleted
  | LiveChatRead;

function websocketBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_WS_URL?.trim();
  if (configuredUrl) {
    if (/^wss?:\/\//i.test(configuredUrl)) {
      return configuredUrl.replace(/\/+$/, "");
    }

    const path = configuredUrl.startsWith("/")
      ? configuredUrl
      : `/${configuredUrl}`;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`.replace(/\/+$/, "");
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function chatWebSocketUrl(chatId: number): string {
  return `${websocketBaseUrl()}/chats/${chatId}/`;
}

/**
 * Decode one socket frame, or null when it is not a shape we recognise.
 *
 * Validation is deliberate rather than a cast: the socket is the one input the
 * UI does not control, and a malformed frame must not reach React state.
 */
export function parseLiveChatEvent(data: string): LiveChatEvent | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (event.type === "message.created") {
    const message = event.message as Partial<ChatMessage> | undefined;
    if (
      !message ||
      !Number.isInteger(message.id) ||
      !Number.isInteger(message.chat) ||
      typeof message.content !== "string" ||
      typeof message.sent_at !== "string"
    ) {
      return null;
    }
    return { type: "message.created", message: message as ChatMessage };
  }

  if (event.type === "message.deleted") {
    if (!Number.isInteger(event.message_id) || !Number.isInteger(event.chat)) {
      return null;
    }
    return {
      type: "message.deleted",
      chat: event.chat as number,
      messageId: event.message_id as number,
    };
  }

  if (event.type === "chat.read") {
    if (
      !Number.isInteger(event.chat) ||
      typeof event.reader !== "string" ||
      !Number.isInteger(event.last_read_message_id)
    ) {
      return null;
    }
    return {
      type: "chat.read",
      chat: event.chat as number,
      reader: event.reader,
      lastReadMessageId: event.last_read_message_id as number,
    };
  }

  return null;
}
