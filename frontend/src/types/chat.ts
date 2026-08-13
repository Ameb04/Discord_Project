import type { PublicUser, Tag } from "./user";

export type ConversationTab = "private" | "groups";

export type DirectChat = {
  id: number;
  type: "direct";
  created?: boolean;
  other_user: PublicUser;
};

export type GroupAccessLevel = "public" | "private";

/** A group as the sidebar knows it — enough to render a row and gate the composer. */
export type GroupConversation = {
  id: number;
  type: "group";
  name: string;
  bio: string;
  tag: Tag | null;
  avatar_url: string | null;
  member_count: number;
  is_owner: boolean;
  access_level: GroupAccessLevel;
  allow_media: boolean;
};

export type GroupMember = {
  user: PublicUser;
  is_owner: boolean;
};

/** The full profile behind a group's name, fetched when the info panel opens. */
export type GroupDetail = GroupConversation & {
  owner: PublicUser;
  members: GroupMember[];
  invite_link: string | null;
};

/** The public preview an invite link shows before the visitor commits to joining. */
export type GroupInvitePreview = {
  id: number;
  name: string;
  bio: string;
  avatar_url: string | null;
  member_count: number;
  is_member: boolean;
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

/**
 * How far every *other* participant has read, as a watermark per person.
 *
 * A watermark rather than a flag per message: receipts are monotonic, so one
 * number per participant answers "has this been seen?" for the whole history,
 * and a live read event updates a single entry instead of every message.
 */
export type ChatReadState = {
  other_member_count: number;
  /** Phone number → id of the last message that person has read. */
  watermarks: Record<string, number>;
};

/** Delivery state of one of the viewer's own messages. */
export type MessageReceipt = {
  seenByCount: number;
  seenByAll: boolean;
};

export type ScheduledChatMessage = {
  id: number;
  chat: number;
  sender: PublicUser | null;
  content: string;
  created_at: string;
  scheduled_at: string;
};

export type ScheduledMessageStatus = "pending" | "sent" | "failed";

export type ScheduledMessageSummary = {
  id: number;
  destination: {
    id: number;
    type: "direct" | "group" | "topic" | "chat";
    name: string;
  };
  preview: string;
  scheduled_at: string;
  status: ScheduledMessageStatus;
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
