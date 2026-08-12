import { AlertCircle, CalendarClock, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScheduledMessages } from "../api/chats";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScheduledMessageStatus, ScheduledMessageSummary } from "../types/chat";

const statusDetails: Record<
  ScheduledMessageStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  pending: { label: "Pending", variant: "default" },
  sent: { label: "Sent", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

function formatScheduledTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ScheduledMessagesPage() {
  const [messages, setMessages] = useState<ScheduledMessageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    getScheduledMessages()
      .then((result) => {
        if (isCurrent) setMessages(result);
      })
      .catch(() => {
        if (isCurrent) setError("Scheduled messages are unavailable right now. Please try again.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        eyebrow="Messages"
        title="Scheduled messages"
        description="Review messages you have scheduled, including their destination and delivery status."
      />

      <section className="mt-8" aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
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
        )}

        {!isLoading && error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 py-12 text-center">
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarClock className="size-6" />
            </span>
            <p className="font-medium text-foreground">Nothing scheduled yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Schedule a message from an open conversation and it will appear here.
            </p>
          </div>
        )}

        {!isLoading && !error && messages.length > 0 && (
          <ul className="grid gap-3">
            {messages.map((message) => {
              const status = statusDetails[message.status];
              return (
                <li key={message.id}>
                  <Card className="gap-3 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <Link
                        to={`/chats/${message.destination.id}`}
                        className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-primary"
                      >
                        <MessageSquareText className="size-4" aria-hidden="true" />
                        {message.destination.name}
                      </Link>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-sm text-foreground/85">{message.preview}</p>
                    <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {formatScheduledTime(message.scheduled_at)}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

export default ScheduledMessagesPage;
