import {
  ArrowLeft,
  Crown,
  Globe,
  Hash,
  ImageOff,
  Images,
  Lock,
  LogIn,
  LoaderCircle,
  Pencil,
  Plus,
  Radio,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deleteTopic, joinChannel } from "@/api/channels";
import { setChannelMuted } from "@/api/chats";
import { ChannelInfoDialog } from "@/components/channel/ChannelInfoDialog";
import { MuteToggleButton } from "@/components/notification/MuteToggleButton";
import { TopicDialog } from "@/components/channel/TopicDialog";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserProfileDialog } from "@/components/user/UserProfileDialog";
import { apiErrorMessage } from "@/lib/apiError";
import { personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChannelDetail, Topic } from "@/types/chat";

type ChannelPageProps = {
  channel: ChannelDetail;
  /** Called whenever the channel changed, so the caller can refresh its copy. */
  onChannelChanged: (channel: ChannelDetail) => void;
  /** Called after the owner deletes it. */
  onChannelDeleted: () => void;
  /** Called after a topic was created, edited or removed. */
  onTopicsChanged: () => void;
};

/**
 * A channel's own page: what it is, who runs it, and the topics inside.
 *
 * A channel holds no messages, so this is deliberately not a chat view. It is
 * the directory you land on when you open a channel and the place every
 * administrative action lives; the conversation is one click further in, in a
 * topic.
 */
function ChannelPage({
  channel,
  onChannelChanged,
  onChannelDeleted,
  onTopicsChanged,
}: ChannelPageProps) {
  const navigate = useNavigate();

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [topicBeingEdited, setTopicBeingEdited] = useState<Topic | null>(null);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [isDeletingTopic, setIsDeletingTopic] = useState(false);
  const [topicError, setTopicError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [profilePhoneNumber, setProfilePhoneNumber] = useState<string | null>(null);

  const isAdmin = channel.is_admin;
  const isMember = channel.is_member;

  async function handleJoin() {
    setIsJoining(true);
    setJoinError("");

    try {
      onChannelChanged(await joinChannel(channel.id));
    } catch (err) {
      setJoinError(apiErrorMessage(err, "Could not join this channel."));
    } finally {
      setIsJoining(false);
    }
  }

  async function handleDeleteTopic() {
    if (!topicToDelete) return;

    setIsDeletingTopic(true);
    setTopicError("");

    try {
      await deleteTopic(channel.id, topicToDelete.id);
      setTopicToDelete(null);
      onTopicsChanged();
    } catch (err) {
      setTopicError(apiErrorMessage(err, "Could not delete this topic."));
    } finally {
      setIsDeletingTopic(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
        {/* On phones the list and the channel are separate screens. */}
        <Button asChild variant="ghost" size="icon" className="size-9 shrink-0 lg:hidden">
          <Link to="/home" aria-label="Back to conversations">
            <ArrowLeft className="size-4.5" aria-hidden="true" />
          </Link>
        </Button>

        <Avatar className="hidden size-11 shrink-0 border border-border sm:block">
          {channel.avatar_url ? (
            <AvatarImage src={channel.avatar_url} alt={channel.name} />
          ) : null}
          <AvatarFallback className="bg-brand-gradient text-white">
            <Radio className="size-5" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
              {channel.name}
            </h1>
            {channel.access_level === "private" ? (
              <Lock
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="Private channel"
              />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
            {channel.member_count}{" "}
            {channel.member_count === 1 ? "member" : "members"} ·{" "}
            {channel.topic_count} {channel.topic_count === 1 ? "topic" : "topics"}
          </p>
        </div>

        {isMember ? (
          <>
            {/* Muting here covers every topic inside, which is why it sits on
                the channel's own page rather than only in each topic. */}
            <MuteToggleButton
              isMuted={channel.is_muted}
              conversationLabel={channel.name}
              onToggle={(muted) => setChannelMuted(channel.id, muted)}
              onToggled={onTopicsChanged}
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Channel members and settings"
              title="Channel info"
              onClick={() => setIsInfoOpen(true)}
            >
              <Settings2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
        <AnimatedContent direction="up" distance={12} className="grid gap-5">
          <section className="rounded-2xl border border-border bg-white/[0.02] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {channel.tag ? (
                    <Badge variant="secondary">{channel.tag.title}</Badge>
                  ) : null}
                  <Badge variant="secondary" className="gap-1">
                    {channel.access_level === "public" ? (
                      <>
                        <Globe className="size-3" aria-hidden="true" />
                        Public
                      </>
                    ) : (
                      <>
                        <Lock className="size-3" aria-hidden="true" />
                        Private
                      </>
                    )}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    {channel.allow_media ? (
                      <>
                        <Images className="size-3" aria-hidden="true" />
                        Media on
                      </>
                    ) : (
                      <>
                        <ImageOff className="size-3" aria-hidden="true" />
                        Media off
                      </>
                    )}
                  </Badge>
                </div>

                <p className="mt-3 text-sm leading-6 break-words text-muted-foreground">
                  {channel.bio.trim() || "This channel has no description yet."}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setProfilePhoneNumber(channel.owner.phone_number)
                  }
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-xs text-muted-foreground/80 outline-none transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <Crown className="size-3.5" aria-hidden="true" />
                  Owned by {personDisplayName(channel.owner)}
                </button>
              </div>

              {!isMember ? (
                <Button
                  type="button"
                  disabled={isJoining}
                  onClick={() => void handleJoin()}
                >
                  {isJoining ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" aria-hidden="true" />
                      Join channel
                    </>
                  )}
                </Button>
              ) : null}
            </div>

            {joinError ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-red-100"
              >
                {joinError}
              </p>
            ) : null}

            {!isMember ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/80">
                <Users className="size-3.5 shrink-0" aria-hidden="true" />
                Join to read and post in these topics.
              </p>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                Topics
              </h2>
              {isAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setTopicError("");
                    setIsCreatingTopic(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New topic
                </Button>
              ) : null}
            </div>

            {topicError ? (
              <p
                role="alert"
                className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
              >
                {topicError}
              </p>
            ) : null}

            {channel.topics.length === 0 ? (
              <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-white/[0.02] px-6 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Hash className="size-6" aria-hidden="true" />
                  </span>
                  <p className="font-medium text-foreground">No topics yet</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {isAdmin
                      ? "Topics are where conversation happens. Add the first one."
                      : "The people who run this channel have not added any topics yet."}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="grid gap-2">
                <AnimatedListPresence reorder>
                  {channel.topics.map((topic, index) => (
                    <AnimatedListItem
                      key={topic.id}
                      index={index}
                      className="min-w-0"
                      reorder
                    >
                      <div
                        className={cn(
                          "flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-white/[0.03] px-3 py-2.5 transition-colors",
                          isMember && "hover:border-primary/40 hover:bg-primary/10"
                        )}
                      >
                        {/* Only a member can open a topic, so a non-member sees
                            the same row without it being a dead link. */}
                        {isMember ? (
                          <Link
                            to={`/chats/${topic.id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          >
                            <TopicIdentity topic={topic} />
                          </Link>
                        ) : (
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <TopicIdentity topic={topic} />
                          </div>
                        )}

                        {isAdmin ? (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Edit ${topic.name}`}
                              onClick={() => {
                                setTopicError("");
                                setTopicBeingEdited(topic);
                              }}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 hover:text-red-300"
                              aria-label={`Delete ${topic.name}`}
                              onClick={() => {
                                setTopicError("");
                                setTopicToDelete(topic);
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </AnimatedListItem>
                  ))}
                </AnimatedListPresence>
              </ul>
            )}
          </section>
        </AnimatedContent>
      </div>

      {isMember ? (
        <ChannelInfoDialog
          open={isInfoOpen}
          channel={channel}
          onClose={() => setIsInfoOpen(false)}
          onChannelChanged={onChannelChanged}
          onChannelDeleted={() => {
            onChannelDeleted();
            navigate("/home", { replace: true });
          }}
          onOpenProfile={setProfilePhoneNumber}
        />
      ) : null}

      <TopicDialog
        open={isCreatingTopic || topicBeingEdited !== null}
        channelId={channel.id}
        topic={topicBeingEdited ?? undefined}
        onClose={() => {
          setIsCreatingTopic(false);
          setTopicBeingEdited(null);
        }}
        onSaved={() => {
          setIsCreatingTopic(false);
          setTopicBeingEdited(null);
          onTopicsChanged();
        }}
      />

      <ConfirmDialog
        open={topicToDelete !== null}
        title="Delete this topic?"
        description={
          topicToDelete
            ? `"${topicToDelete.name}" and its messages will no longer be reachable by anyone in the channel.`
            : undefined
        }
        confirmLabel="Delete topic"
        pendingLabel="Deleting..."
        isPending={isDeletingTopic}
        error={topicError}
        onCancel={() => setTopicToDelete(null)}
        onConfirm={() => void handleDeleteTopic()}
      />

      {profilePhoneNumber ? (
        <UserProfileDialog
          open
          phoneNumber={profilePhoneNumber}
          onClose={() => setProfilePhoneNumber(null)}
        />
      ) : null}
    </section>
  );
}

/** Name, description and posting state — the same block whether it links or not. */
function TopicIdentity({ topic }: { topic: Topic }) {
  return (
    <>
      <Avatar className="size-10 shrink-0 border border-border">
        {topic.avatar_url ? (
          <AvatarImage src={topic.avatar_url} alt={topic.name} />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-foreground">
          <Hash className="size-4" aria-hidden="true" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-foreground">{topic.name}</p>
          {!topic.allow_member_messages ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <Lock className="size-3" aria-hidden="true" />
              Admins only
            </Badge>
          ) : null}
          {topic.tag ? (
            <Badge variant="secondary" className="shrink-0">
              {topic.tag.title}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {topic.bio.trim() || "No description."}
        </p>
      </div>
    </>
  );
}

export default ChannelPage;
