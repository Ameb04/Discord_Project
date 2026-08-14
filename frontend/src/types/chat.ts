import type { PublicUser, Tag } from "./user";

export type ConversationTab = "private" | "groups" | "channels";

/**
 * How far behind the viewer is in one conversation.
 *
 * Both numbers are derived from the read watermark on every request rather
 * than stored, so they cannot drift out of step with the messages themselves.
 * `first_unread_message_id` is what the "unread messages" line is drawn above.
 */
export type UnreadState = {
  unread_count: number;
  first_unread_message_id: number | null;
};

export type DirectChat = {
  id: number;
  type: "direct";
  created?: boolean;
  other_user: PublicUser;
  /** The viewer has silenced this chat's notifications. Never affects access. */
  is_muted: boolean;
} & UnreadState;

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
  is_muted: boolean;
  access_level: GroupAccessLevel;
  allow_media: boolean;
} & UnreadState;

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

/**
 * A topic — the only thing inside a channel that actually holds messages.
 *
 * `id` is a chat id, the same namespace as a group or a direct chat, so a
 * topic opens at `/chats/:id` through the very same page.
 */
export type Topic = {
  id: number;
  type: "topic";
  name: string;
  bio: string;
  tag: Tag | null;
  avatar_url: string | null;
  channel: number;
  /**
   * This topic's own mute only. Its channel can be muted independently, which
   * silences the topic too — every surface rendering a topic has the channel
   * beside it, so the two are combined there rather than conflated here.
   */
  is_muted: boolean;
  access_level: GroupAccessLevel;
  /** False while admins have the topic closed to everyone but themselves. */
  allow_member_messages: boolean;
} & UnreadState;

/**
 * A channel as any surface knows it.
 *
 * Carries the viewer's own standing, because every list that renders a channel
 * immediately has to decide which controls to show.
 */
export type ChannelConversation = {
  id: number;
  type: "channel";
  name: string;
  bio: string;
  tag: Tag | null;
  avatar_url: string | null;
  member_count: number;
  topic_count: number;
  is_owner: boolean;
  is_admin: boolean;
  is_member: boolean;
  /** Silences every topic inside, including ones added later. */
  is_muted: boolean;
  /**
   * Everything unread across the topics inside. A channel holds no messages
   * itself, so it has a total but no "first unread" of its own.
   */
  unread_count: number;
  access_level: GroupAccessLevel;
  allow_media: boolean;
};

export type ChannelMember = {
  user: PublicUser;
  is_owner: boolean;
  is_admin: boolean;
};

/**
 * The full channel, with its people and its topics.
 *
 * `members` comes back empty for a non-member previewing a public channel, and
 * `invite_link` is null for anyone who is not an admin.
 */
export type ChannelDetail = ChannelConversation & {
  owner: PublicUser;
  members: ChannelMember[];
  topics: Topic[];
  invite_link: string | null;
};

/** The public preview an invite link shows before the visitor commits. */
export type ChannelInvitePreview = {
  id: number;
  name: string;
  bio: string;
  avatar_url: string | null;
  member_count: number;
  topic_count: number;
  access_level: GroupAccessLevel;
  is_member: boolean;
};

export type ConversationIndex = {
  private_chats: DirectChat[];
  groups: GroupConversation[];
  channels: ChannelDetail[];
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
} & UnreadState;

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
