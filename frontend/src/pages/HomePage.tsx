import { MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getConversationIndex } from "../api/chats";
import ChatPage from "./ChatPage";
import ConversationSidebar from "../components/chat/ConversationSidebar";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import type { ConversationIndex, ConversationTab } from "../types/chat";

function displayName(firstName: string, lastName: string, phoneNumber: string) {
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || phoneNumber;
}

function HomePage() {
  const { chatId } = useParams<{ chatId?: string }>();

  const [conversations, setConversations] = useState<ConversationIndex>({
    private_chats: [],
    groups: [],
  });
  const [activeTab, setActiveTab] = useState<ConversationTab>("private");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const hasRouteChatId = typeof chatId === "string";

  const parsedChatId = useMemo(() => {
    if (!chatId) return null;
    const numericChatId = Number(chatId);
    if (!Number.isInteger(numericChatId) || numericChatId <= 0) return null;
    return numericChatId;
  }, [chatId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadConversations() {
      setIsLoading(true);
      setError("");

      try {
        const nextConversations = await getConversationIndex();
        if (isCurrent) setConversations(nextConversations);
      } catch {
        if (isCurrent) {
          setConversations({ private_chats: [], groups: [] });
          setError("Unable to load your chats right now.");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadConversations();

    return () => {
      isCurrent = false;
    };
  }, []);

  const selectedPrivateChat = conversations.private_chats.find((item) => item.id === parsedChatId);
  const selectedGroup = conversations.groups.find((item) => item.id === parsedChatId);

  useEffect(() => {
    if (parsedChatId === null) return;
    if (selectedPrivateChat) {
      setActiveTab("private");
    } else if (selectedGroup) {
      setActiveTab("groups");
    }
  }, [parsedChatId, selectedPrivateChat, selectedGroup]);

  const selectedTitle = selectedPrivateChat
    ? displayName(
        selectedPrivateChat.other_user.first_name ?? "",
        selectedPrivateChat.other_user.last_name ?? "",
        selectedPrivateChat.other_user.phone_number
      )
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

  return (
    <div className="h-full min-h-0">
      <div className="mx-auto h-full w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <ConversationSidebar
            privateChats={conversations.private_chats}
            groups={conversations.groups}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedChatId={parsedChatId}
            isLoading={isLoading}
            error={error}
          />

          <main className="h-full min-h-0 overflow-hidden">
            {hasRouteChatId ? (
              parsedChatId === null ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card/50 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm">
                  <div className="max-w-xl text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
                      Invalid conversation
                    </p>
                    <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                      This conversation link is not valid.
                    </h1>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                      The selected chat could not be opened. Go back to your inbox and choose a valid conversation.
                    </p>

                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                      <Button asChild>
                        <Link to="/home">Back to inbox</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link to="/search">Search people</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <ChatPage
                  chatId={parsedChatId}
                  title={selectedTitle}
                  subtitle={selectedSubtitle}
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card/50 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm">
                <div className="max-w-2xl text-center">
                  <span className="bg-brand-gradient mx-auto grid size-16 place-items-center rounded-3xl text-white shadow-glow">
                    <MessagesSquare className="size-8" aria-hidden="true" />
                  </span>
                  <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Pick a conversation to start
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Use the sidebar to switch between direct messages and groups. You can
                    also search for people from the top bar and open a new chat.
                  </p>

                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Button asChild>
                      <Link to="/search">Search people</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/settings">Open settings</Link>
                    </Button>
                  </div>

                  {isLoading ? (
                    <div className="mx-auto mt-8 grid max-w-xs gap-3 text-left">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
