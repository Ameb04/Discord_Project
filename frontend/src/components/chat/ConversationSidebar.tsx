import {
  ChevronRight,
  Compass,
  Hash,
  Lock,
  MessageCircle,
  Plus,
  Radio,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { CountUp } from "@/components/motion/CountUp";
import { overlayTransition, springTransition } from "@/components/motion/transitions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsFor, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ChannelDetail,
  ConversationTab,
  DirectChat,
  GroupConversation,
} from "../../types/chat";

const PANEL_ID = "conversation-list-panel";

type ConversationSidebarProps = {
  privateChats: DirectChat[];
  groups: GroupConversation[];
  channels: ChannelDetail[];
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  /** The open chat — a direct chat, a group, or a topic. */
  selectedChatId: number | null;
  /** The open channel overview, when the main pane is showing one. */
  selectedChannelId: number | null;
  isLoading?: boolean;
  error?: string;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
};

/** Row shell shared by direct chats, groups and topics. */
function ConversationRow({
  to,
  isActive,
  className,
  children,
}: {
  to: string;
  isActive: boolean;
  className?: string;
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
          : "border-transparent hover:border-border hover:bg-white/[0.05]",
        className
      )}
    >
      {children}
    </Link>
  );
}

/**
 * One channel and, when opened, the topics inside it.
 *
 * The channel itself is never a chat, so its row leads to the channel's own
 * page; the topics under it are the things you can actually talk in. Both are
 * reachable without leaving the list, which is the point of the accordion —
 * moving between two topics of the same channel is one click, not three.
 */
function ChannelRow({
  channel,
  isExpanded,
  onToggle,
  isChannelOpen,
  selectedChatId,
}: {
  channel: ChannelDetail;
  isExpanded: boolean;
  onToggle: () => void;
  isChannelOpen: boolean;
  selectedChatId: number | null;
}) {
  const topicsLabel = `${channel.topic_count} ${channel.topic_count === 1 ? "topic" : "topics"}`;
  const membersLabel = `${channel.member_count} ${channel.member_count === 1 ? "member" : "members"}`;

  return (
    <div className="grid gap-1">
      <div
        className={cn(
          "flex items-center gap-1 overflow-hidden rounded-2xl border transition-colors",
          isChannelOpen
            ? "border-primary/40 bg-primary/10"
            : "border-transparent hover:border-border hover:bg-white/[0.05]"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? `Hide topics in ${channel.name}`
              : `Show topics in ${channel.name}`
          }
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={springTransition}
            className="grid place-items-center"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </motion.span>
        </button>

        <Link
          to={`/channels/${channel.id}`}
          aria-current={isChannelOpen ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Avatar className="size-9 shrink-0 border border-border">
            {channel.avatar_url ? (
              <AvatarImage src={channel.avatar_url} alt={channel.name} />
            ) : null}
            <AvatarFallback className="bg-brand-gradient text-white">
              <Radio className="size-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-medium text-foreground">
                {channel.name}
              </p>
              {channel.access_level === "private" ? (
                <Lock
                  className="size-3 shrink-0 text-muted-foreground/70"
                  aria-label="Private channel"
                />
              ) : null}
              {channel.is_owner ? (
                <Badge variant="secondary" className="shrink-0">
                  Owner
                </Badge>
              ) : channel.is_admin ? (
                <Badge variant="secondary" className="shrink-0">
                  Admin
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {topicsLabel} · {membersLabel}
            </p>
          </div>
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="topics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={overlayTransition}
            className="overflow-hidden"
          >
            {/* The rule down the left is what makes these read as *inside* the
                channel rather than as siblings of it. */}
            <ul className="ml-4 grid gap-1 border-l border-border pl-3">
              {channel.topics.length === 0 ? (
                <li className="px-2 py-2 text-xs text-muted-foreground/70">
                  No topics yet.
                </li>
              ) : (
                channel.topics.map((topic) => {
                  const isActive = selectedChatId === topic.id;
                  return (
                    <li key={topic.id} className="min-w-0">
                      <ConversationRow
                        to={`/chats/${topic.id}`}
                        isActive={isActive}
                        className="gap-2 px-2.5 py-2"
                      >
                        <Hash
                          className={cn(
                            "size-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground/70"
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {topic.name}
                        </span>
                        {!topic.allow_member_messages ? (
                          <Lock
                            className="size-3 shrink-0 text-muted-foreground/70"
                            aria-label="Only admins can post"
                          />
                        ) : null}
                      </ConversationRow>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ConversationSidebar({
  privateChats,
  groups,
  channels,
  activeTab,
  onTabChange,
  selectedChatId,
  selectedChannelId,
  isLoading = false,
  error,
  onCreateGroup,
  onCreateChannel,
}: ConversationSidebarProps) {
  // Which channels are open, as an explicit set. `null` means "nobody has
  // touched this yet", which is what lets the open conversation decide.
  const [expandedChannelIds, setExpandedChannelIds] = useState<Set<number> | null>(
    null
  );

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
    {
      key: "channels" as const,
      label: "Channels",
      icon: Radio,
      count: channels.length,
    },
  ];

  // The channel holding the open topic, or the one whose page is showing.
  const activeChannelId =
    channels.find((channel) =>
      channel.topics.some((topic) => topic.id === selectedChatId)
    )?.id ?? selectedChannelId;

  function isChannelExpanded(channelId: number) {
    // Until the reader expands something themselves, the channel they are
    // looking at is the one that stands open.
    if (expandedChannelIds === null) return channelId === activeChannelId;
    return expandedChannelIds.has(channelId);
  }

  function toggleChannel(channelId: number) {
    setExpandedChannelIds((current) => {
      const next = new Set(
        current ?? (activeChannelId !== null ? [activeChannelId] : [])
      );
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  }

  const listForTab =
    activeTab === "private" ? privateChats : activeTab === "groups" ? groups : channels;
  const isEmpty = listForTab.length === 0;

  // "New" means whatever the visible tab is a list of: a direct chat starts by
  // finding a person, a group or channel starts by describing one.
  type NewConversationAction =
    | { kind: "link"; to: string; label: string; title: string }
    | { kind: "dialog"; onClick: () => void; label: string; title: string };

  const newConversation: NewConversationAction =
    activeTab === "private"
      ? {
          kind: "link",
          to: "/search",
          label: "Find someone to message",
          title: "New direct chat",
        }
      : activeTab === "groups"
        ? {
            kind: "dialog",
            onClick: onCreateGroup,
            label: "Create a new group",
            title: "New group",
          }
        : {
            kind: "dialog",
            onClick: onCreateChannel,
            label: "Create a new channel",
            title: "New channel",
          };

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
        {newConversation.kind === "link" ? (
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            title={newConversation.title}
          >
            <Link to={newConversation.to} aria-label={newConversation.label}>
              <Plus className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label={newConversation.label}
            title={newConversation.title}
            onClick={newConversation.onClick}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-b border-border p-3">
        <div
          role="tablist"
          className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-white/[0.03] p-1"
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
                  "relative inline-flex items-center justify-center gap-1 rounded-xl px-1 py-2 text-sm font-medium transition-colors",
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
                <Icon className="relative size-4 shrink-0" aria-hidden="true" />
                {/* Three labels, three icons and three counts share one rail,
                    so the longest label — "Channels" — is what the sidebar's
                    track width has to be able to spell out; `truncate` is only
                    the backstop for a count that runs to several digits. Below
                    `sm` the label steps aside entirely and the counts do the
                    work alone. */}
                <span className="relative hidden truncate sm:inline">
                  {label}
                </span>
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={cn(
                    "relative h-5 min-w-5 justify-center px-1",
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
          <EmptyTab activeTab={activeTab} onCreateGroup={onCreateGroup} onCreateChannel={onCreateChannel} />
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
        ) : activeTab === "groups" ? (
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
        ) : (
          <ul className="grid gap-1.5">
            <AnimatedListPresence>
              {channels.map((channel, index) => (
                <AnimatedListItem key={channel.id} index={index} className="min-w-0">
                  <ChannelRow
                    channel={channel}
                    isExpanded={isChannelExpanded(channel.id)}
                    onToggle={() => toggleChannel(channel.id)}
                    isChannelOpen={selectedChannelId === channel.id}
                    selectedChatId={selectedChatId}
                  />
                </AnimatedListItem>
              ))}
            </AnimatedListPresence>
          </ul>
        )}
      </div>
    </aside>
  );
}

function EmptyTab({
  activeTab,
  onCreateGroup,
  onCreateChannel,
}: {
  activeTab: ConversationTab;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
}) {
  const copy = {
    private: {
      icon: MessageCircle,
      title: "No direct chats yet",
      body: "Search for people and start a direct message.",
    },
    groups: {
      icon: Users,
      title: "No groups yet",
      body: "Groups you create or join will appear here.",
    },
    channels: {
      icon: Radio,
      title: "No channels yet",
      body: "Create one, or browse the public channels anyone can join.",
    },
  }[activeTab];
  const Icon = copy.icon;

  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-4 text-center">
      <div className="max-w-xs">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy.body}</p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {activeTab === "private" ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/search">Search people</Link>
            </Button>
          ) : activeTab === "groups" ? (
            <Button type="button" variant="outline" size="sm" onClick={onCreateGroup}>
              <Plus className="size-4" aria-hidden="true" />
              New group
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" onClick={onCreateChannel}>
                <Plus className="size-4" aria-hidden="true" />
                New channel
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/search?tab=channels">
                  <Compass className="size-4" aria-hidden="true" />
                  Explore
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConversationSidebar;
