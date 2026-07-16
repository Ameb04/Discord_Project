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
  attachment: AttachmentMetadata | null;
};