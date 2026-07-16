import client from "./client";
import type { ChatMessage, ConversationIndex, DirectChat } from "../types/chat";

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

export async function getChatMessages(chatId: number): Promise<ChatMessage[]> {
  const response = await client.get<ChatMessage[]>(`/api/chats/${chatId}/messages/`);
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