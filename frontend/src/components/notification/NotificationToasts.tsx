import { Hash, MessageCircle, Radio, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";

import { springTransition } from "@/components/motion/transitions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNotifications } from "@/context/NotificationContext";
import { formatMessageTimestamp, initialsFor, personDisplayName } from "@/lib/format";
import type { ActiveNotification } from "@/types/notification";

/**
 * Live message notifications, stacked in the corner of the app.
 *
 * Bottom-right rather than top: the top of every page already carries the
 * navbar and a page heading, and a toast that lands there covers the thing the
 * reader was looking at. Down here it sits over the tail of a message list,
 * which is the least costly place to borrow a few rows from.
 *
 * Newest at the bottom, nearest the corner — the same direction a conversation
 * grows, so the eye does not have to change habit to read one.
 */
export function NotificationToasts() {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    // `pointer-events-none` on the rail with each card opting back in: the
    // stack spans a column of the screen that must stay clickable between and
    // around the cards.
    <div
      aria-live="polite"
      aria-label="New message notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      <AnimatePresence initial={false}>
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.key}
            notification={notification}
            onDismiss={() => dismiss(notification.key)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotificationCard({
  notification,
  onDismiss,
}: {
  notification: ActiveNotification;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const { conversation, sender, preview, sentAt } = notification;

  const senderName = personDisplayName(sender, "Someone");
  // In a direct chat the title already *is* the sender, so repeating their name
  // on the line below would say the same thing twice.
  const isDirect = conversation.type === "direct";
  const contextLine = isDirect
    ? conversation.channel || ""
    : conversation.type === "topic" && conversation.channel
      ? `${senderName} in ${conversation.channel}`
      : senderName;

  function openConversation() {
    onDismiss();
    navigate(`/chats/${notification.chat}`);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={springTransition}
      className="pointer-events-auto"
    >
      <div className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-md">
        {/* A gradient hairline down the leading edge, so a toast reads as
            belonging to this app rather than to the browser. */}
        <span
          className="bg-brand-gradient absolute inset-y-0 left-0 w-1"
          aria-hidden="true"
        />

        <ConversationAvatar notification={notification} senderName={senderName} />

        <button
          type="button"
          onClick={openConversation}
          className="min-w-0 flex-1 rounded-lg pl-0.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label={`Open ${conversation.title}`}
        >
          <div className="flex items-center gap-1.5">
            <ConversationIcon type={conversation.type} />
            <p className="truncate text-sm font-semibold text-foreground">
              {conversation.title}
            </p>
          </div>

          {contextLine ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
              {contextLine}
            </p>
          ) : null}

          {/* Two lines of preview: enough to tell whether it needs answering
              now, not so much that the toast becomes a reading surface. */}
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 break-words text-muted-foreground">
            {preview}
          </p>

          <p className="mt-1.5 text-[0.6875rem] text-muted-foreground/60">
            {formatMessageTimestamp(sentAt)}
          </p>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition hover:bg-white/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>

        {/* The countdown to auto-dismiss, drawn rather than described. Its
            duration mirrors DISMISS_AFTER_MS in NotificationContext. */}
        <motion.span
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 6, ease: "linear" }}
          style={{ transformOrigin: "left" }}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/40"
          aria-hidden="true"
        />
      </div>
    </motion.div>
  );
}

/** The room's picture where there is one, the sender's otherwise. */
function ConversationAvatar({
  notification,
  senderName,
}: {
  notification: ActiveNotification;
  senderName: string;
}) {
  const { sender, conversation } = notification;

  return (
    <Avatar className="ml-1 size-10 shrink-0 border border-border">
      {sender?.avatar_url ? (
        <AvatarImage src={sender.avatar_url} alt={senderName} />
      ) : null}
      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-foreground">
        {conversation.type === "direct"
          ? initialsFor(senderName)
          : initialsFor(conversation.title)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Which kind of room this came from, in the icon the sidebar already uses. */
function ConversationIcon({ type }: { type: ActiveNotification["conversation"]["type"] }) {
  const className = "size-3.5 shrink-0 text-primary/80";

  if (type === "group") return <Users className={className} aria-label="Group" />;
  if (type === "topic") return <Hash className={className} aria-label="Topic" />;
  if (type === "chat") return <Radio className={className} aria-label="Channel" />;
  return <MessageCircle className={className} aria-label="Direct message" />;
}

export default NotificationToasts;
