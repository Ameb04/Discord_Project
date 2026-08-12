import type { PublicUser } from "./user";

export type ConversationTab = "private" | "groups";

export type DirectChat = {
  id: number;
  type: "direct";
  created?: boolean;
  other_user: PublicUser;
};

export type GroupConversation = {
  id: number;
  type: "group";
  name: string;
  bio: string;
  member_count: number;
  is_owner: boolean;
  access_level: "public" | "private";
};

export type ConversationIndex = {
  private_chats: DirectChat[];
  groups: GroupConversation[];
};

export type AttachmentMetadata = {
  id: number;
  name: string;
  type: string;
  size: number | null;
  download_url: string;
};

export type ChatMessage = {
  id: number;
  chat: number;
  sender: PublicUser | null;
  content: string;
  sent_at: string;
  is_edited?: boolean;
  attachment: AttachmentMetadata | null;
};

export type ScheduledChatMessage = {
  id: number;
  chat: number;
  sender: PublicUser | null;
  content: string;
  created_at: string;
  scheduled_at: string;
};

export type ChatHistoryResponse = {
  results: ChatMessage[];
  count: number;
  has_older: boolean;
  has_newer: boolean;
  oldest_message_id: number | null;
  newest_message_id: number | null;
};

export type ChatHistoryContextResponse = ChatHistoryResponse & {
  focus_message_id: number;
};

export type ChatSearchResult = {
  id: number;
  chat: number;
  sender: PublicUser | null;
  preview: string;
  sent_at: string;
  is_edited?: boolean;
};

export type ChatSearchResponse = {
  query: string;
  count: number;
  results: ChatSearchResult[];
};
