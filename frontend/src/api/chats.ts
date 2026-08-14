import client from "./client";
import type {
  ChatHistoryContextResponse,
  ChatHistoryResponse,
  ChatMessage,
  ChatReadState,
  ChatSearchResponse,
  DirectChat,
  ConversationIndex,
  ScheduledChatMessage,
  ScheduledMessageSummary,
} from "../types/chat";

type MessageHistoryParams = {
  /** Page backwards: the messages above this one. */
  before?: number;
  /** Page forwards: the messages below this one. */
  after?: number;
  /**
   * Open where the reader left off instead of at the end. Falls back to the
   * newest page when there is nothing unread.
   */
  anchor?: "unread";
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

/**
 * Silence or unsilence one conversation for the signed-in person alone.
 *
 * PUT mutes and DELETE unmutes, so firing the same call twice is harmless —
 * which a toggle button will do sooner or later.
 */
export async function setChatMuted(
  chatId: number,
  muted: boolean
): Promise<boolean> {
  const url = `/api/chats/${chatId}/mute/`;
  const response = muted
    ? await client.put<{ is_muted: boolean }>(url)
    : await client.delete<{ is_muted: boolean }>(url);
  return response.data.is_muted;
}

/** The same, for a whole channel — every topic in it, present and future. */
export async function setChannelMuted(
  channelId: number,
  muted: boolean
): Promise<boolean> {
  const url = `/api/channels/${channelId}/mute/`;
  const response = muted
    ? await client.put<{ is_muted: boolean }>(url)
    : await client.delete<{ is_muted: boolean }>(url);
  return response.data.is_muted;
}

export async function editMessage(
  chatId: number,
  messageId: number,
  content: string,
  file?: File,
  removeFile?: boolean
): Promise<ChatMessage> {
  const url = `/api/chats/${chatId}/messages/${messageId}/`;

  if (file || removeFile) {
    const formData = new FormData();
    formData.append("content", content);
    if (file) {
      formData.append("file", file);
    }
    if (removeFile) {
      formData.append("remove_file", "true");
    }

    const response = await client.patch<ChatMessage>(url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }

  const response = await client.patch<ChatMessage>(url, { content });
  return response.data;
}

export async function deleteMessage(
  chatId: number,
  messageId: number
): Promise<void> {
  await client.delete(`/api/chats/${chatId}/messages/${messageId}/`);
}

export async function getChatReadState(chatId: number): Promise<ChatReadState> {
  const response = await client.get<ChatReadState>(
    `/api/chats/${chatId}/messages/read/`
  );
  return response.data;
}

/** Advance the caller's read watermark. Omit the id to mark everything read. */
export async function markChatRead(
  chatId: number,
  messageId?: number
): Promise<number> {
  const response = await client.post<{ last_read_message_id: number }>(
    `/api/chats/${chatId}/messages/read/`,
    messageId === undefined ? {} : { message_id: messageId }
  );
  return response.data.last_read_message_id;
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

export async function cancelScheduledMessage(messageId: number): Promise<void> {
  await client.delete(`/api/messages/scheduled/${messageId}/`);
}
