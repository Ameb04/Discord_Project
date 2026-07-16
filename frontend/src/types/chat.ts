import type { PublicUser } from "./user";

export type ChatParticipant = PublicUser;

export type DirectChat = {
  id: number;
  type: "direct";
  created?: boolean;
  other_user: PublicUser;
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
