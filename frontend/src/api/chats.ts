import client from "./client";
import type {
  ChatHistoryContextResponse,
  ChatHistoryResponse,
  ChatMessage,
  ChatSearchResponse,
  DirectChat,
  ConversationIndex,
  ScheduledChatMessage,
  ScheduledMessageSummary,
} from "../types/chat";

type MessageHistoryParams = {
  before?: number;
  limit?: number;
};

export async function getConversationIndex(): Promise<ConversationIndex> {
  const response = await client.get<ConversationIndex>("/api/chats/");
  return response.data;
}

export async function startDirectChat(targetUserPhoneNumber: string): Promise<DirectChat> {
  const response = await client.post<DirectChat>("/api/chats/direct/", {
    target_user: targetUserPhoneNumber,
  });
  return response.data;
}

export async function getChatMessages(
  chatId: number,
  params: MessageHistoryParams = {}
): Promise<ChatHistoryResponse> {
  const response = await client.get<ChatHistoryResponse>(
    `/api/chats/${chatId}/messages/history/`,
    {
      params,
    }
  );
  return response.data;
}

export async function searchChatMessages(
  chatId: number,
  query: string
): Promise<ChatSearchResponse> {
  const response = await client.get<ChatSearchResponse>(
    `/api/chats/${chatId}/messages/search/`,
    {
      params: { q: query },
    }
  );
  return response.data;
}

export async function getChatMessageContext(
  chatId: number,
  messageId: number,
  window = 20
): Promise<ChatHistoryContextResponse> {
  const response = await client.get<ChatHistoryContextResponse>(
    `/api/chats/${chatId}/messages/${messageId}/context/`,
    {
      params: { window },
    }
  );
  return response.data;
}

export async function sendTextMessage(
  chatId: number,
  content: string
): Promise<ChatMessage> {
  const response = await client.post<ChatMessage>(`/api/chats/${chatId}/messages/`, {
    content,
  });
  return response.data;
}

export async function sendMediaMessage(
  chatId: number,
  file: File,
  content = ""
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("file", file);
  if (content) {
    formData.append("content", content);
  }

  const response = await client.post<ChatMessage>(
    `/api/chats/${chatId}/messages/media/`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return response.data;
}

export async function scheduleTextMessage(
  chatId: number,
  content: string,
  scheduledAt: string
): Promise<ScheduledChatMessage> {
  const response = await client.post<ScheduledChatMessage>(
    `/api/chats/${chatId}/messages/scheduled/`,
    {
      content,
      scheduled_at: scheduledAt,
    }
  );
  return response.data;
}

export async function getScheduledMessages(): Promise<ScheduledMessageSummary[]> {
  const response = await client.get<ScheduledMessageSummary[]>(
    "/api/messages/scheduled/"
  );
  return response.data;
}
