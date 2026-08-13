import { MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getConversationIndex } from "../api/chats";
import ChatPage from "./ChatPage";
import ConversationSidebar from "../components/chat/ConversationSidebar";
import { CreateGroupDialog } from "@/components/group/CreateGroupDialog";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationIndex, ConversationTab } from "../types/chat";

const EMPTY_INDEX: ConversationIndex = { private_chats: [], groups: [] };

/**
 * The signed-in home: a conversation list beside the open conversation.
 *
 * Below `lg` the two panes are separate *screens* rather than a squeezed
 * two-column grid — the route already distinguishes them (`/home` versus
 * `/chats/:id`), so the back button lands where a phone user expects.
 */
function HomePage() {
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [conversations, setConversations] = useState<ConversationIndex>(EMPTY_INDEX);
  const [activeTab, setActiveTab] = useState<ConversationTab>("private");
  // The tab the open conversation last forced, so a manual tab change is not
  // immediately overwritten by the same conversation staying open.
  const [syncedTab, setSyncedTab] = useState<ConversationTab | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const hasRouteChatId = typeof chatId === "string";

  const parsedChatId = useMemo(() => {
    if (!chatId) return null;
    const numericChatId = Number(chatId);
    if (!Number.isInteger(numericChatId) || numericChatId <= 0) return null;
    return numericChatId;
  }, [chatId]);

  const selectedPrivateChat = conversations.private_chats.find(
    (item) => item.id === parsedChatId
  );
  const selectedGroup = conversations.groups.find((item) => item.id === parsedChatId);

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

  // Opening a conversation the sidebar has never heard of means the cached list
  // is stale — which is exactly what happens right after "Message" creates a
  // brand-new direct chat. Refetch once per unknown id, never in a loop.
  const isUnknownConversation =
    parsedChatId !== null &&
    !isLoading &&
    !selectedPrivateChat &&
    !selectedGroup &&
    refetchedForChatId !== parsedChatId;

  if (isUnknownConversation) {
    setRefetchedForChatId(parsedChatId);
    setReloadKey((key) => key + 1);
  }

  // Which tab is showing follows the open conversation. Derived during render
  // rather than synced in an effect, so the sidebar never paints the wrong tab
  // for a frame.
  const selectedTab: ConversationTab | null = selectedGroup
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
      : undefined;

  // `grid-rows-[minmax(0,1fr)]` is explicit on purpose: the single row must fill
  // the container so both panes can scroll internally, and leaning on
  // `align-content: stretch` to do that implicitly is easy to break later.
  /** Pull the conversation list again after something changed it. */
  function refreshConversations() {
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-7xl grid-rows-[minmax(0,1fr)] gap-4 px-3 py-3 sm:px-6 sm:py-4 lg:grid-cols-[19rem_minmax(0,1fr)] lg:px-8">
      <div className={cn("min-h-0", hasRouteChatId && "hidden lg:block")}>
        <ConversationSidebar
          privateChats={conversations.private_chats}
          groups={conversations.groups}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedChatId={parsedChatId}
          isLoading={isLoading}
          error={error}
          onCreateGroup={() => setIsCreatingGroup(true)}
        />
      </div>

      <main className={cn("min-h-0", !hasRouteChatId && "hidden lg:block")}>
        {parsedChatId !== null ? (
          <ChatPage
            // Remount on conversation change so no state leaks between chats.
            key={parsedChatId}
            chatId={parsedChatId}
            title={selectedTitle}
            subtitle={selectedSubtitle}
            group={selectedGroup}
            directPeer={selectedPrivateChat?.other_user}
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
    </div>
  );
}

function EmptyPane({
  invalidLink,
  isLoading,
}: {
  invalidLink: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto rounded-2xl border border-border bg-card/50 p-5 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-6">
      <AnimatedContent direction="up" scale className="max-w-2xl text-center">
        {invalidLink ? (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
              Invalid conversation
            </p>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
              This conversation link is not valid.
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              The selected chat could not be opened. Go back to your inbox and
              choose a valid conversation.
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
              Use the sidebar to switch between direct messages and groups. You
              can also search for people from the top bar and open a new chat.
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
            <Link to={invalidLink ? "/search" : "/settings"}>
              {invalidLink ? "Search people" : "Open settings"}
            </Link>
          </Button>
        </div>

        {isLoading && !invalidLink ? (
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
