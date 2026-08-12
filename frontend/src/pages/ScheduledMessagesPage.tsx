import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  MessageSquareText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";

import { cancelScheduledMessage, getScheduledMessages } from "../api/chats";
import { PageHeader } from "../components/PageHeader";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import {
  AnimatedListItem,
  AnimatedListPresence,
} from "@/components/motion/AnimatedList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/useNow";
import {
  formatDayLabel,
  formatRelativeToNow,
  formatTime,
  startOfDay,
} from "@/lib/datetime";
import type { ScheduledMessageStatus, ScheduledMessageSummary } from "../types/chat";

const statusDetails: Record<
  ScheduledMessageStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive";
    icon: ComponentType<{ className?: string }>;
  }
> = {
  pending: { label: "Pending", variant: "default", icon: CalendarClock },
  sent: { label: "Sent", variant: "secondary", icon: CircleCheck },
  failed: { label: "Failed", variant: "destructive", icon: TriangleAlert },
};

type MessageGroup = {
  key: number;
  label: string;
  messages: ScheduledMessageSummary[];
};

/**
 * Bucket messages by delivery day, preserving the API's chronological order.
 * A flat list of absolute timestamps reads as noise; day headings turn it into
 * a timeline.
 */
function groupByDay(
  messages: ScheduledMessageSummary[],
  now: Date
): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const day = startOfDay(new Date(message.scheduled_at));
    const key = day.getTime();
    const lastGroup = groups.at(-1);

    if (lastGroup?.key === key) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ key, label: formatDayLabel(day, now), messages: [message] });
    }
  }

  return groups;
}

function ScheduledMessagesPage() {
  const now = useNow();
  const [messages, setMessages] = useState<ScheduledMessageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;

    getScheduledMessages()
      .then((result) => {
        if (isCurrent) setMessages(result);
      })
      .catch(() => {
        if (isCurrent) {
          setLoadError(
            "Scheduled messages are unavailable right now. Please try again."
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const groups = useMemo(() => groupByDay(messages, now), [messages, now]);
  const pendingCount = messages.filter(
    (message) => message.status === "pending"
  ).length;

  async function handleCancel(messageId: number) {
    setCancellingId(messageId);
    setActionError("");
    try {
      await cancelScheduledMessage(messageId);
      setMessages((current) =>
        current.filter((message) => message.id !== messageId)
      );
    } catch {
      setActionError(
        "That message could not be cancelled. It may have already been processed."
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
      <PageHeader
        eyebrow="Messages"
        title="Scheduled messages"
        description={
          pendingCount > 0
            ? `${pendingCount} message${pendingCount === 1 ? "" : "s"} waiting to be delivered.`
            : "Review messages you have scheduled, including their destination and delivery status."
        }
      />

      <section className="mt-8" aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <div className="grid gap-3" aria-label="Loading scheduled messages">
            {[0, 1, 2].map((key) => (
              <Card key={key} className="gap-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-44" />
              </Card>
            ))}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
          >
            <CircleAlert className="size-4 shrink-0" />
            {loadError}
          </div>
        ) : (
          <>
            {actionError ? (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
              >
                <CircleAlert className="size-4 shrink-0" />
                {actionError}
              </div>
            ) : null}

            {messages.length === 0 ? (
              <AnimatedContent
                direction="up"
                className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 py-12 text-center"
              >
                <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarClock className="size-6" />
                </span>
                <p className="font-medium text-foreground">Nothing scheduled yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Schedule a message from an open conversation and it will appear
                  here.
                </p>
              </AnimatedContent>
            ) : (
              <div className="grid gap-6">
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {group.label}
                    </h2>
                    <ul className="grid gap-3">
                      <AnimatedListPresence reorder>
                        {group.messages.map((message, index) => {
                          const status = statusDetails[message.status];
                          const StatusIcon = status.icon;
                          const scheduledDate = new Date(message.scheduled_at);
                          const isCancelling = cancellingId === message.id;

                          return (
                            <AnimatedListItem key={message.id} index={index} reorder>
                              <Card className="gap-3 p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                                  <Link
                                    to={`/chats/${message.destination.id}`}
                                    className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground hover:text-primary"
                                  >
                                    <MessageSquareText
                                      className="size-4 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">
                                      {message.destination.name}
                                    </span>
                                  </Link>
                                  <Badge
                                    variant={status.variant}
                                    className="gap-1.5 whitespace-nowrap"
                                  >
                                    <StatusIcon
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                    {status.label}
                                  </Badge>
                                </div>

                                <p className="text-sm break-words text-foreground/85">
                                  {message.preview}
                                </p>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                    <CalendarClock
                                      className="size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <time dateTime={message.scheduled_at}>
                                      {formatTime(scheduledDate)}
                                    </time>
                                    {message.status === "pending" ? (
                                      <span className="text-muted-foreground/70">
                                        · {formatRelativeToNow(scheduledDate, now)}
                                      </span>
                                    ) : null}
                                  </p>
                                  {message.status === "pending" ? (
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      disabled={isCancelling}
                                      onClick={() => void handleCancel(message.id)}
                                    >
                                      <Trash2
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                      {isCancelling ? "Cancelling..." : "Cancel"}
                                    </Button>
                                  ) : null}
                                </div>
                              </Card>
                            </AnimatedListItem>
                          );
                        })}
                      </AnimatedListPresence>
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default ScheduledMessagesPage;
