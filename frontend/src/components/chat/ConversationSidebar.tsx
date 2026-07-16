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

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">Conversations</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Inbox</h2>
      </div>

      <div className="border-b border-white/10 p-3">
        <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => onTabChange("private")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              activeTab === "private"
                ? "bg-white text-black"
                : "text-white/65 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Private Chats
            <Badge variant="secondary" className="ml-1">
              {privateChats.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("groups")}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              activeTab === "groups"
                ? "bg-white text-black"
                : "text-white/65 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            <Users className="size-4" aria-hidden="true" />
            Groups
            <Badge variant="secondary" className="ml-1">
              {groups.length}
            </Badge>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100/80"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : null}

        {!isLoading && activeItems.length === 0 ? (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
            <div className="max-w-xs">
              <p className="font-medium text-white/80">
                {activeTab === "private" ? "No private chats yet" : "No groups yet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-white/45">
                {activeTab === "private"
                  ? "Search for people and start a direct message."
                  : "Groups you join will appear here."}
              </p>
              {activeTab === "private" ? (
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/search">Search people</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!isLoading && activeTab === "private" ? (
          <ul className="grid gap-2">
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
                      "flex items-center gap-3 rounded-2xl border px-3 py-3 transition",
                      isActive
                        ? "border-white/25 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    )}
                  >
                    <Avatar className="size-11 shrink-0">
                      {otherUser.avatar_url ? (
                        <AvatarImage src={otherUser.avatar_url} alt={name} />
                      ) : null}
                      <AvatarFallback>{avatarFallback}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{name}</p>
                      <p className="mt-1 truncate text-sm text-white/45">{subtitle}</p>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!isLoading && activeTab === "groups" ? (
          <ul className="grid gap-2">
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
                      "flex items-center gap-3 rounded-2xl border px-3 py-3 transition",
                      isActive
                        ? "border-white/25 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    )}
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
                      <Users className="size-5 text-white/70" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="truncate font-medium text-white">{group.name}</p>
                        {group.is_owner ? (
                          <Badge variant="secondary" className="shrink-0">
                            Owner
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-white/45">{subtitle}</p>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />
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