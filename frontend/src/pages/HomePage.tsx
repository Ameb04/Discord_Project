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
    <div className="h-full min-h-0 bg-[#090909] text-white">
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
                <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
                  <div className="max-w-xl text-center">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                      Invalid conversation
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold text-white">
                      This conversation link is not valid.
                    </h1>
                    <p className="mt-3 text-sm leading-7 text-white/60">
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
              <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
                <div className="max-w-2xl text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Home</p>
                  <h1 className="mt-3 text-3xl font-semibold text-white">
                    Pick a private chat or group
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    Use the sidebar on the left to switch between direct messages and groups.
                    You can also search for users from the top bar and open a new chat.
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
                    <div className="mt-8 grid gap-3 text-left">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-72" />
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