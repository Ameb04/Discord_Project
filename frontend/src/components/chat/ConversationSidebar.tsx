import { ChevronRight, MessageCircle, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  ConversationTab,
  DirectChat,
  GroupConversation,
} from "../../types/chat";

type ConversationSidebarProps = {
  privateChats: DirectChat[];
  groups: GroupConversation[];
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  selectedChatId: number | null;
  isLoading?: boolean;
  error?: string;
};

function displayName(firstName: string, lastName: string, phoneNumber: string) {
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || phoneNumber;
}

function initialsFromName(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return initials || "?";
}

function ConversationSidebar({
  privateChats,
  groups,
  activeTab,
  onTabChange,
  selectedChatId,
  isLoading = false,
  error,
}: ConversationSidebarProps) {
  const activeItems = activeTab === "private" ? privateChats : groups;

  const tabs: { key: ConversationTab; label: string; icon: typeof MessageCircle; count: number }[] = [
    { key: "private", label: "Direct", icon: MessageCircle, count: privateChats.length },
    { key: "groups", label: "Groups", icon: Users, count: groups.length },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
          Conversations
        </p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">Inbox</h2>
      </div>

      <div className="border-b border-border p-3">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-white/[0.03] p-1">
          {tabs.map(({ key, label, icon: Icon, count }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={cn("ml-0.5 h-5 min-w-5 px-1.5", isActive ? "bg-primary/80" : "")}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : null}

        {!isLoading && activeItems.length === 0 ? (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-4 text-center">
            <div className="max-w-xs">
              <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                {activeTab === "private" ? (
                  <MessageCircle className="size-5" />
                ) : (
                  <Users className="size-5" />
                )}
              </span>
              <p className="font-medium text-foreground">
                {activeTab === "private" ? "No direct chats yet" : "No groups yet"}
              </p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {activeTab === "private"
                  ? "Search for people and start a direct message."
                  : "Groups you join will appear here."}
              </p>
              {activeTab === "private" ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/search">Search people</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isLoading && activeTab === "private" ? (
          <ul className="grid gap-1.5">
            {privateChats.map((chat) => {
              const otherUser = chat.other_user;
              const name = displayName(
                otherUser.first_name,
                otherUser.last_name,
                otherUser.phone_number
              );
              const subtitle = otherUser.tag
                ? `${otherUser.phone_number} · ${otherUser.tag.title}`
                : otherUser.phone_number;
              const isActive = selectedChatId === chat.id;
              const avatarFallback = initialsFromName(name);

              return (
                <li key={chat.id}>
                  <Link
                    to={`/chats/${chat.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-white/[0.05]"
                    )}
                  >
                    <Avatar className="size-11 shrink-0 border border-border">
                      {otherUser.avatar_url ? (
                        <AvatarImage src={otherUser.avatar_url} alt={name} />
                      ) : null}
                      <AvatarFallback className="bg-primary/15 text-sm font-semibold text-foreground">
                        {avatarFallback}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!isLoading && activeTab === "groups" ? (
          <ul className="grid gap-1.5">
            {groups.map((group) => {
              const isActive = selectedChatId === group.id;
              const subtitle = group.bio.trim()
                ? group.bio
                : `${group.member_count} ${group.member_count === 1 ? "member" : "members"}`;

              return (
                <li key={group.id}>
                  <Link
                    to={`/chats/${group.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="bg-brand-gradient grid size-11 shrink-0 place-items-center rounded-2xl text-white">
                      <Users className="size-5" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{group.name}</p>
                        {group.is_owner ? (
                          <Badge variant="secondary" className="shrink-0">
                            Owner
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

export default ConversationSidebar;
