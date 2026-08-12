import { ChevronRight, MessageCircle, Plus, Users } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { CountUp } from "@/components/motion/CountUp";
import { springTransition } from "@/components/motion/transitions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsFor, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ConversationTab,
  DirectChat,
  GroupConversation,
} from "../../types/chat";

const PANEL_ID = "conversation-list-panel";

type ConversationSidebarProps = {
  privateChats: DirectChat[];
  groups: GroupConversation[];
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  selectedChatId: number | null;
  isLoading?: boolean;
  error?: string;
  onCreateGroup: () => void;
};

/** Row shell shared by direct chats and groups. */
function ConversationRow({
  to,
  isActive,
  children,
}: {
  to: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        // `overflow-hidden` is the backstop: every text run inside already
        // truncates, but a badge or an unbroken string must never paint past
        // the rounded edge of the card.
        "flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 transition-colors",
        isActive
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-white/[0.05]"
      )}
    >
      {children}
    </Link>
  );
}

function ConversationSidebar({
  privateChats,
  groups,
  activeTab,
  onTabChange,
  selectedChatId,
  isLoading = false,
  error,
  onCreateGroup,
}: ConversationSidebarProps) {
  const tabs = [
    {
      key: "private" as const,
      label: "Direct",
      icon: MessageCircle,
      count: privateChats.length,
    },
    {
      key: "groups" as const,
      label: "Groups",
      icon: Users,
      count: groups.length,
    },
  ];
  const isEmpty = (activeTab === "private" ? privateChats : groups).length === 0;
  // "New" means whatever the visible tab is a list of: a direct chat starts by
  // finding a person, a group starts by describing one.
  const isPrivateTab = activeTab === "private";
  const newConversationLabel = isPrivateTab
    ? "Find someone to message"
    : "Create a new group";

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-[0.2em] text-primary/80 uppercase">
            Conversations
          </p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
            Inbox
          </h2>
        </div>
        {isPrivateTab ? (
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            title="New direct chat"
          >
            <Link to="/search" aria-label={newConversationLabel}>
              <Plus className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label={newConversationLabel}
            title="New group"
            onClick={onCreateGroup}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-b border-border p-3">
        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-white/[0.03] p-1"
        >
          {tabs.map(({ key, label, icon: Icon, count }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`conversation-tab-${key}`}
                aria-selected={isActive}
                aria-controls={PANEL_ID}
                onClick={() => onTabChange(key)}
                className={cn(
                  "relative inline-flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="conversation-tab-pill"
                    className="absolute inset-0 rounded-xl bg-primary/15"
                    transition={springTransition}
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative">{label}</span>
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={cn(
                    "relative h-5 min-w-5 justify-center px-1.5",
                    isActive && "bg-primary/80"
                  )}
                >
                  <CountUp value={count} />
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`conversation-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
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
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : isEmpty ? (
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
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={onCreateGroup}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New group
                </Button>
              )}
            </div>
          </div>
        ) : activeTab === "private" ? (
          <ul className="grid gap-1.5">
            <AnimatedListPresence>
              {privateChats.map((chat, index) => {
                const otherUser = chat.other_user;
                const name = personDisplayName(otherUser);
                const subtitle = otherUser.tag
                  ? `${otherUser.phone_number} · ${otherUser.tag.title}`
                  : otherUser.phone_number;

                return (
                  <AnimatedListItem key={chat.id} index={index} className="min-w-0">
                    <ConversationRow
                      to={`/chats/${chat.id}`}
                      isActive={selectedChatId === chat.id}
                    >
                      <Avatar className="size-11 shrink-0 border border-border">
                        {otherUser.avatar_url ? (
                          <AvatarImage src={otherUser.avatar_url} alt={name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/15 text-sm font-semibold text-foreground">
                          {initialsFor(name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{name}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {subtitle}
                        </p>
                      </div>

                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/50"
                        aria-hidden="true"
                      />
                    </ConversationRow>
                  </AnimatedListItem>
                );
              })}
            </AnimatedListPresence>
          </ul>
        ) : (
          <ul className="grid gap-1.5">
            <AnimatedListPresence>
              {groups.map((group, index) => {
                const subtitle =
                  group.bio.trim() ||
                  `${group.member_count} ${group.member_count === 1 ? "member" : "members"}`;

                return (
                  <AnimatedListItem key={group.id} index={index} className="min-w-0">
                    <ConversationRow
                      to={`/chats/${group.id}`}
                      isActive={selectedChatId === group.id}
                    >
                      <Avatar className="size-11 shrink-0 border border-border">
                        {group.avatar_url ? (
                          <AvatarImage src={group.avatar_url} alt={group.name} />
                        ) : null}
                        <AvatarFallback className="bg-brand-gradient text-white">
                          <Users className="size-5" aria-hidden="true" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">
                            {group.name}
                          </p>
                          {group.is_owner ? (
                            <Badge variant="secondary" className="shrink-0">
                              Owner
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {subtitle}
                        </p>
                      </div>

                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground/50"
                        aria-hidden="true"
                      />
                    </ConversationRow>
                  </AnimatedListItem>
                );
              })}
            </AnimatedListPresence>
          </ul>
        )}
      </div>
    </aside>
  );
}

export default ConversationSidebar;
