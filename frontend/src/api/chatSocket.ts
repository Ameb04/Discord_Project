import type { ChatMessage } from "../types/chat";

type LiveMessageEvent = {
  type: "message.created";
  message: ChatMessage;
};

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

export function parseLiveMessageEvent(data: string): ChatMessage | null {
  try {
    const event = JSON.parse(data) as Partial<LiveMessageEvent>;
    const message = event.message as Partial<ChatMessage> | undefined;
    if (
      event.type !== "message.created" ||
      !message ||
      !Number.isInteger(message.id) ||
      !Number.isInteger(message.chat) ||
      typeof message.content !== "string" ||
      typeof message.sent_at !== "string"
    ) {
      return null;
    }
    return message as ChatMessage;
  } catch {
    return null;
  }
}
