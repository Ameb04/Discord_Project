import { MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getChannel } from "../api/channels";
import { getConversationIndex } from "../api/chats";
import ChannelPage from "./ChannelPage";
import ChatPage from "./ChatPage";
import ConversationSidebar from "../components/chat/ConversationSidebar";
import { CreateChannelDialog } from "@/components/channel/CreateChannelDialog";
import { CreateGroupDialog } from "@/components/group/CreateGroupDialog";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ChannelDetail,
  ConversationIndex,
  ConversationTab,
} from "../types/chat";

const EMPTY_INDEX: ConversationIndex = {
  private_chats: [],
  groups: [],
  channels: [],
};

/**
 * The signed-in home: a conversation list beside whatever is open.
 *
 * Three things can occupy the main pane — a chat, a channel's own page, or
 * nothing — and all three share one sidebar, so they share one route
 * component. Below `lg` the two panes are separate *screens* rather than a
 * squeezed two-column grid: the route already distinguishes them, so the back
 * button lands where a phone user expects.
 */
function HomePage() {
  const { chatId, channelId } = useParams<{
    chatId?: string;
    channelId?: string;
  }>();
  const navigate = useNavigate();

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [conversations, setConversations] = useState<ConversationIndex>(EMPTY_INDEX);
  const [activeTab, setActiveTab] = useState<ConversationTab>("private");
  // The tab the open conversation last forced, so a manual tab change is not
  // immediately overwritten by the same conversation staying open.
  const [syncedTab, setSyncedTab] = useState<ConversationTab | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const hasRouteChatId = typeof chatId === "string";
  const hasRouteChannelId = typeof channelId === "string";
  const hasOpenPane = hasRouteChatId || hasRouteChannelId;

  const parsedChatId = useNumericRouteId(chatId);
  const parsedChannelId = useNumericRouteId(channelId);

  const selectedPrivateChat = conversations.private_chats.find(
    (item) => item.id === parsedChatId
  );
  const selectedGroup = conversations.groups.find((item) => item.id === parsedChatId);

  // A topic is reached by its chat id like anything else, but rendering it
  // needs the channel around it — for the admin powers and the media rule.
  const selectedTopicChannel =
    parsedChatId === null
      ? undefined
      : conversations.channels.find((channel) =>
          channel.topics.some((topic) => topic.id === parsedChatId)
        );
  const selectedTopic = selectedTopicChannel?.topics.find(
    (topic) => topic.id === parsedChatId
  );

  const [reloadKey, setReloadKey] = useState(0);
  const [refetchedForChatId, setRefetchedForChatId] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadConversations() {
      try {
        const nextConversations = await getConversationIndex();
        if (!isCurrent) return;
        setConversations(nextConversations);
        setError("");
      } catch {
        if (!isCurrent) return;
        setConversations(EMPTY_INDEX);
        setError("Unable to load your chats right now.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadConversations();

    return () => {
      isCurrent = false;
    };
  }, [reloadKey]);

  /** Pull the conversation list again after something changed it. */
  const refreshConversations = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  // A channel the index does not carry — a public one reached from the
  // directory or an invite. Fetched on its own so a stranger can look at it
  // and decide to join.
  const memberChannel =
    conversations.channels.find((item) => item.id === parsedChannelId) ?? null;
  const [previewChannel, setPreviewChannel] = useState<ChannelDetail | null>(null);
  const [channelError, setChannelError] = useState("");
  /** Which id the fetch above has finished with, success or failure. */
  const [resolvedChannelId, setResolvedChannelId] = useState<number | null>(null);

  useEffect(() => {
    if (parsedChannelId === null) return;

    let isCurrent = true;

    async function loadChannel(id: number) {
      try {
        const channel = await getChannel(id);
        if (!isCurrent) return;
        setPreviewChannel(channel);
        setChannelError("");
      } catch {
        if (!isCurrent) return;
        setPreviewChannel(null);
        setChannelError("This channel does not exist, or it is private.");
      } finally {
        if (isCurrent) setResolvedChannelId(id);
      }
    }

    void loadChannel(parsedChannelId);

    return () => {
      isCurrent = false;
    };
  }, [parsedChannelId, reloadKey]);

  // The index copy wins while it exists: it is refreshed by every membership
  // change, so it is the one that stays in step with the sidebar. The preview
  // is only trusted for the id it was actually fetched for.
  const selectedChannel =
    memberChannel ??
    (previewChannel?.id === parsedChannelId ? previewChannel : null);
  const isChannelPending =
    parsedChannelId !== null &&
    !selectedChannel &&
    resolvedChannelId !== parsedChannelId;

  // Opening a conversation the sidebar has never heard of means the cached list
  // is stale — which is exactly what happens right after "Message" creates a
  // brand-new direct chat. Refetch once per unknown id, never in a loop.
  const isUnknownConversation =
    parsedChatId !== null &&
    !isLoading &&
    !selectedPrivateChat &&
    !selectedGroup &&
    !selectedTopic &&
    refetchedForChatId !== parsedChatId;

  if (isUnknownConversation) {
    setRefetchedForChatId(parsedChatId);
    setReloadKey((key) => key + 1);
  }

  // Which tab is showing follows what is open. Derived during render rather
  // than synced in an effect, so the sidebar never paints the wrong tab for a
  // frame.
  const selectedTab: ConversationTab | null = selectedTopic
    ? "channels"
    : parsedChannelId !== null
      ? "channels"
      : selectedGroup
        ? "groups"
        : selectedPrivateChat
          ? "private"
          : null;

  if (selectedTab !== null && selectedTab !== syncedTab) {
    setSyncedTab(selectedTab);
    setActiveTab(selectedTab);
  }

  const selectedTitle = selectedPrivateChat
    ? personDisplayName(selectedPrivateChat.other_user)
    : selectedGroup
      ? selectedGroup.name
      : selectedTopic
        ? selectedTopic.name
        : parsedChatId !== null
          ? `Chat #${parsedChatId}`
          : undefined;

  const selectedSubtitle = selectedPrivateChat
    ? selectedPrivateChat.other_user.tag
      ? `${selectedPrivateChat.other_user.phone_number} · ${selectedPrivateChat.other_user.tag.title}`
      : selectedPrivateChat.other_user.phone_number
    : selectedGroup
      ? selectedGroup.bio.trim() ||
        `${selectedGroup.member_count} ${selectedGroup.member_count === 1 ? "member" : "members"}`
      : selectedTopic && selectedTopicChannel
        ? // The channel comes first: which room you are in matters more than
          // what this particular topic is about.
          `${selectedTopicChannel.name}${
            selectedTopic.bio.trim() ? ` · ${selectedTopic.bio.trim()}` : ""
          }`
        : undefined;

  // `grid-rows-[minmax(0,1fr)]` is explicit on purpose: the single row must fill
  // the container so both panes can scroll internally, and leaning on
  // `align-content: stretch` to do that implicitly is easy to break later.
  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[84rem] grid-rows-[minmax(0,1fr)] gap-4 px-3 py-3 sm:px-6 sm:py-4 lg:grid-cols-[24rem_minmax(0,1fr)] lg:px-8">
      <div className={cn("min-h-0", hasOpenPane && "hidden lg:block")}>
        <ConversationSidebar
          privateChats={conversations.private_chats}
          groups={conversations.groups}
          channels={conversations.channels}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedChatId={parsedChatId}
          selectedChannelId={parsedChannelId}
          isLoading={isLoading}
          error={error}
          onCreateGroup={() => setIsCreatingGroup(true)}
          onCreateChannel={() => setIsCreatingChannel(true)}
        />
      </div>

      <main className={cn("min-h-0", !hasOpenPane && "hidden lg:block")}>
        {hasRouteChannelId ? (
          selectedChannel ? (
            <ChannelPage
              // Remount on channel change so no state leaks between channels.
              key={selectedChannel.id}
              channel={selectedChannel}
              onChannelChanged={(channel) => {
                setPreviewChannel(channel);
                refreshConversations();
              }}
              onChannelDeleted={refreshConversations}
              onTopicsChanged={refreshConversations}
            />
          ) : (
            <EmptyPane
              invalidLink={!isChannelPending}
              isLoading={isChannelPending}
              message={channelError}
            />
          )
        ) : parsedChatId !== null ? (
          <ChatPage
            // Remount on conversation change so no state leaks between chats.
            key={parsedChatId}
            chatId={parsedChatId}
            title={selectedTitle}
            subtitle={selectedSubtitle}
            group={selectedGroup}
            directPeer={selectedPrivateChat?.other_user}
            topic={selectedTopic}
            topicChannel={selectedTopicChannel}
            onGroupChanged={refreshConversations}
            onGroupDeleted={() => {
              refreshConversations();
              navigate("/home", { replace: true });
            }}
          />
        ) : (
          <EmptyPane invalidLink={hasRouteChatId} isLoading={isLoading} />
        )}
      </main>

      <CreateGroupDialog
        open={isCreatingGroup}
        onClose={() => setIsCreatingGroup(false)}
        onCreated={(group) => {
          setIsCreatingGroup(false);
          refreshConversations();
          setActiveTab("groups");
          navigate(`/chats/${group.id}`);
        }}
      />

      <CreateChannelDialog
        open={isCreatingChannel}
        onClose={() => setIsCreatingChannel(false)}
        onCreated={(channel) => {
          setIsCreatingChannel(false);
          refreshConversations();
          setActiveTab("channels");
          navigate(`/channels/${channel.id}`);
        }}
      />
    </div>
  );
}

/** Parse a positive integer route parameter, or null when it is not one. */
function useNumericRouteId(value: string | undefined) {
  return useMemo(() => {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }, [value]);
}

function EmptyPane({
  invalidLink,
  isLoading,
  message,
}: {
  invalidLink: boolean;
  isLoading: boolean;
  message?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto rounded-2xl border border-border bg-card/50 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-6">
      <AnimatedContent direction="up" scale className="max-w-2xl text-center">
        {invalidLink ? (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
              Not available
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
              This link is not valid.
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {message ||
                "The selected conversation could not be opened. Go back to your inbox and choose a valid one."}
            </p>
          </>
        ) : (
          <>
            <span className="bg-brand-gradient mx-auto grid size-14 place-items-center rounded-3xl text-white shadow-glow sm:size-16">
              <MessagesSquare className="size-7 sm:size-8" aria-hidden="true" />
            </span>
            <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Pick a conversation to start
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Use the sidebar to switch between direct messages, groups and
              channels. You can also search for people and public channels from
              the top bar.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to={invalidLink ? "/home" : "/search"}>
              {invalidLink ? "Back to inbox" : "Search people"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/search?tab=channels">Explore channels</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="mx-auto mt-8 grid max-w-xs gap-3 text-left">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : null}
      </AnimatedContent>
    </div>
  );
}

export default HomePage;
