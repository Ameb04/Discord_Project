import type { PublicUser } from "./user";

export type NotificationConversationType =
  | "direct"
  | "group"
  | "topic"
  | "chat";

/**
 * How a conversation names itself to someone who is not currently in it.
 *
 * A direct chat has no name of its own, so the server fills `title` with the
 * sender's; a topic carries the channel around it, because a topic name alone
 * ("general") says nothing about where it came from.
 */
export type NotificationConversation = {
  id: number;
  type: NotificationConversationType;
  title: string;
  /** The channel a topic belongs to; empty for every other kind of room. */
  channel: string;
};

/** A message arrived somewhere the reader is not looking. */
export type MessageNotification = {
  chat: number;
  messageId: number;
  conversation: NotificationConversation;
  sender: PublicUser | null;
  preview: string;
  sentAt: string;
  /**
   * Whether this is allowed to interrupt, as opposed to merely count.
   *
   * Muted conversations still send the event — their unread badge has to move
   * like any other — but arrive with this false, so nothing is shown. The mute
   * decision stays on the server; this is only its verdict travelling.
   */
  notify: boolean;
};

/** One notification as the toast stack holds it, with its own identity. */
export type ActiveNotification = MessageNotification & {
  /** Unique per toast — two messages can share neither id nor arrival order. */
  key: string;
};
