import {
  Check,
  Copy,
  Crown,
  Globe,
  ImageOff,
  Images,
  Link2,
  LoaderCircle,
  Lock,
  Radio,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  addChannelMember,
  channelInviteUrlFor,
  deleteChannel,
  removeChannelMember,
  resetChannelInvite,
  setChannelAdmin,
  updateChannel,
} from "@/api/channels";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { MemberAdder } from "@/components/room/MemberAdder";
import { RoomProfileFields } from "@/components/room/RoomProfileFields";
import {
  draftFromRoom,
  draftToProfileInput,
  type RoomProfileDraft,
} from "@/components/room/roomProfile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { apiErrorMessage } from "@/lib/apiError";
import { initialsFor, personDisplayName } from "@/lib/format";
import type { ChannelDetail, ChannelMember } from "@/types/chat";

type ChannelInfoDialogProps = {
  open: boolean;
  channel: ChannelDetail;
  onClose: () => void;
  /** Fired whenever the channel changes, so the caller can refresh. */
  onChannelChanged: (channel: ChannelDetail) => void;
  /** Fired after the owner deletes it, so the caller can navigate away. */
  onChannelDeleted: () => void;
  onOpenProfile?: (phoneNumber: string) => void;
};

function MemberRow({
  member,
  isViewerOwner,
  canRemove,
  isBusy,
  onRemove,
  onToggleAdmin,
  onOpenProfile,
}: {
  member: ChannelMember;
  isViewerOwner: boolean;
  canRemove: boolean;
  isBusy: boolean;
  onRemove: () => void;
  onToggleAdmin: () => void;
  onOpenProfile?: (phoneNumber: string) => void;
}) {
  const displayName = personDisplayName(member.user, "Unnamed user");

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-white/[0.03] px-3 py-2">
      <Avatar className="size-9 shrink-0 border border-border">
        {member.user.avatar_url ? (
          <AvatarImage src={member.user.avatar_url} alt={displayName} />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-xs font-semibold text-foreground">
          {initialsFor(displayName)}
        </AvatarFallback>
      </Avatar>

      {/* The whole identity block is the target, not just the name: a 9px-tall
          text run is a poor tap target on a phone. */}
      <button
        type="button"
        disabled={!onOpenProfile}
        onClick={() => onOpenProfile?.(member.user.phone_number)}
        className="min-w-0 flex-1 rounded-lg text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 enabled:hover:text-primary disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          {member.is_owner ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <Crown className="size-3" aria-hidden="true" />
              Owner
            </Badge>
          ) : member.is_admin ? (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <Shield className="size-3" aria-hidden="true" />
              Admin
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {member.user.tag
            ? `${member.user.phone_number} · ${member.user.tag.title}`
            : member.user.phone_number}
        </p>
      </button>

      {/* Promotion is the owner's alone; removal is any admin's, except of
          another admin. */}
      {isViewerOwner && !member.is_owner ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          disabled={isBusy}
          aria-label={
            member.is_admin
              ? `Remove admin from ${displayName}`
              : `Make ${displayName} an admin`
          }
          title={member.is_admin ? "Remove admin" : "Make admin"}
          onClick={onToggleAdmin}
        >
          {member.is_admin ? (
            <ShieldOff className="size-4" aria-hidden="true" />
          ) : (
            <Shield className="size-4" aria-hidden="true" />
          )}
        </Button>
      ) : null}

      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 hover:text-red-300"
          disabled={isBusy}
          aria-label={`Remove ${displayName} from the channel`}
          onClick={onRemove}
        >
          {isBusy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserMinus className="size-4" aria-hidden="true" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Everything behind a channel's name: who is in it, who runs it, and — for
 * those who do — the controls to change any of that.
 *
 * The channel is passed in rather than fetched, because the page behind this
 * dialog already holds the authoritative copy and both have to agree; every
 * mutation here hands the server's response straight back up.
 */
function ChannelInfoDialog({
  open,
  channel,
  onClose,
  onChannelChanged,
  onChannelDeleted,
  onOpenProfile,
}: ChannelInfoDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RoomProfileDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ChannelMember | null>(null);
  const [removeError, setRemoveError] = useState("");

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isResettingInvite, setIsResettingInvite] = useState(false);

  const { hasCopied, copy } = useCopyFeedback();

  // Closing and reopening should not resume a half-finished edit.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setIsEditing(false);
      setSaveError("");
      setRemoveError("");
    }
  }

  const isOwner = channel.is_owner;
  const isAdmin = channel.is_admin;
  const canSaveProfile = Boolean(draft?.name.trim()) && !isSaving;

  function startEditing() {
    setDraft(draftFromRoom(channel));
    setSaveError("");
    setIsEditing(true);
  }

  async function handleSaveProfile() {
    if (!draft || !draft.name.trim()) return;

    setIsSaving(true);
    setSaveError("");

    try {
      onChannelChanged(
        await updateChannel(
          channel.id,
          draftToProfileInput(draft, { includeAccessLevel: true })
        )
      );
      setIsEditing(false);
    } catch (err) {
      setSaveError(
        apiErrorMessage(err, "Could not save these changes.", ["name", "avatar"])
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleMedia() {
    setSaveError("");
    try {
      onChannelChanged(
        await updateChannel(channel.id, { allow_media: !channel.allow_media })
      );
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not change the media setting."));
    }
  }

  async function handleToggleAdmin(member: ChannelMember) {
    setBusyPhone(member.user.phone_number);
    setSaveError("");

    try {
      onChannelChanged(
        await setChannelAdmin(
          channel.id,
          member.user.phone_number,
          !member.is_admin
        )
      );
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not change this role.", ["user"]));
    } finally {
      setBusyPhone(null);
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;

    const phoneNumber = memberToRemove.user.phone_number;
    setBusyPhone(phoneNumber);
    setRemoveError("");

    try {
      onChannelChanged(await removeChannelMember(channel.id, phoneNumber));
      setMemberToRemove(null);
    } catch (err) {
      setRemoveError(
        apiErrorMessage(err, "Could not remove this member.", ["user"])
      );
    } finally {
      setBusyPhone(null);
    }
  }

  async function handleResetInvite() {
    setIsResettingInvite(true);
    setSaveError("");

    try {
      onChannelChanged(await resetChannelInvite(channel.id));
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not issue a new invite link."));
    } finally {
      setIsResettingInvite(false);
    }
  }

  async function handleDeleteChannel() {
    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteChannel(channel.id);
      setIsConfirmingDelete(false);
      onChannelDeleted();
      onClose();
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Could not delete this channel."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={channel.name}
        description={`${channel.member_count} ${channel.member_count === 1 ? "member" : "members"} · ${channel.topic_count} ${channel.topic_count === 1 ? "topic" : "topics"}`}
        icon={<Radio className="size-4.5" aria-hidden="true" />}
        className="sm:max-w-xl"
      >
        <div className="grid gap-5">
          {isEditing && draft ? (
            <section className="grid gap-4">
              <RoomProfileFields
                value={draft}
                onChange={setDraft}
                disabled={isSaving}
                existingAvatarUrl={channel.avatar_url}
                showAccessLevel
                nameLabel="Channel name"
                namePlaceholder="University A"
                bioPlaceholder="What is this channel about?"
                fallbackIcon={<Radio className="size-6" aria-hidden="true" />}
              />

              {saveError ? (
                <p
                  role="alert"
                  className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
                >
                  {saveError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => setIsEditing(false)}
                >
                  <X className="size-4" aria-hidden="true" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSaveProfile}
                  onClick={() => void handleSaveProfile()}
                >
                  {isSaving ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Save changes
                    </>
                  )}
                </Button>
              </div>
            </section>
          ) : (
            <section className="flex items-start gap-4">
              <Avatar className="size-16 shrink-0 border border-border">
                {channel.avatar_url ? (
                  <AvatarImage src={channel.avatar_url} alt={channel.name} />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-foreground">
                  {initialsFor(channel.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate text-lg font-semibold text-foreground">
                    {channel.name}
                  </h3>
                  {channel.tag ? (
                    <Badge variant="secondary">{channel.tag.title}</Badge>
                  ) : null}
                </div>

                {channel.bio.trim() ? (
                  <p className="mt-1.5 text-sm leading-6 break-words text-muted-foreground">
                    {channel.bio}
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground/70">
                    No bio yet.
                  </p>
                )}

                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
                  <span className="inline-flex items-center gap-1">
                    <Crown className="size-3.5" aria-hidden="true" />
                    {personDisplayName(channel.owner)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    {channel.access_level === "public" ? (
                      <>
                        <Globe className="size-3.5" aria-hidden="true" />
                        Public
                      </>
                    ) : (
                      <>
                        <Lock className="size-3.5" aria-hidden="true" />
                        Private
                      </>
                    )}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    {channel.allow_media ? (
                      <>
                        <Images className="size-3.5" aria-hidden="true" />
                        Media allowed
                      </>
                    ) : (
                      <>
                        <ImageOff className="size-3.5" aria-hidden="true" />
                        Media off
                      </>
                    )}
                  </span>
                </p>
              </div>

              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={startEditing}
                >
                  <Check className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              ) : null}
            </section>
          )}

          {channel.invite_link ? (
            <section className="grid gap-2">
              <p className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                <Link2 className="size-3.5" aria-hidden="true" />
                Invite link
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                  {channelInviteUrlFor(channel.invite_link)}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    void copy(channelInviteUrlFor(channel.invite_link ?? ""))
                  }
                >
                  {hasCopied ? (
                    <>
                      <Check className="size-4" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={isResettingInvite}
                  title="Revoke this link and issue a new one"
                  onClick={() => void handleResetInvite()}
                >
                  {isResettingInvite ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  New link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Anyone who opens this link joins the channel, private or not.
                Generating a new one immediately stops the old link from working.
              </p>
            </section>
          ) : null}

          {isAdmin ? (
            <section className="grid gap-2">
              <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                Add members
              </p>
              <MemberAdder
                roomLabel="channel"
                memberPhones={
                  new Set(
                    channel.members.map((member) => member.user.phone_number)
                  )
                }
                onAdd={async (user) => {
                  onChannelChanged(
                    await addChannelMember(channel.id, user.phone_number)
                  );
                }}
              />
            </section>
          ) : null}

          <section className="grid gap-2">
            <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
              Members ({channel.members.length})
            </p>

            {/* A removal failure is reported inside the confirmation, which
                stays open on error — repeating it here would double-report. */}
            <ul className="grid gap-1.5">
              <AnimatedListPresence reorder>
                {channel.members.map((member, index) => (
                  <AnimatedListItem
                    key={member.user.phone_number}
                    index={index}
                    className="min-w-0"
                    reorder
                  >
                    <MemberRow
                      member={member}
                      isViewerOwner={isOwner}
                      // An admin may remove members; only the owner may remove
                      // another admin, and nobody may remove the owner.
                      canRemove={
                        isAdmin &&
                        !member.is_owner &&
                        (isOwner || !member.is_admin)
                      }
                      isBusy={busyPhone === member.user.phone_number}
                      onRemove={() => {
                        setRemoveError("");
                        setMemberToRemove(member);
                      }}
                      onToggleAdmin={() => void handleToggleAdmin(member)}
                      onOpenProfile={onOpenProfile}
                    />
                  </AnimatedListItem>
                ))}
              </AnimatedListPresence>
            </ul>
          </section>

          {saveError && !isEditing ? (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
            >
              {saveError}
            </p>
          ) : null}

          {isAdmin ? (
            <section className="grid gap-3 rounded-2xl border border-border bg-white/[0.02] p-4">
              <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                {isOwner ? "Owner controls" : "Admin controls"}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Allow media</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Members can attach files in every topic when this is on.
                    Admins always can.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={channel.allow_media ? "default" : "outline"}
                  size="sm"
                  className="shrink-0"
                  aria-pressed={channel.allow_media}
                  onClick={() => void handleToggleMedia()}
                >
                  {channel.allow_media ? (
                    <>
                      <Images className="size-4" aria-hidden="true" />
                      On
                    </>
                  ) : (
                    <>
                      <ImageOff className="size-4" aria-hidden="true" />
                      Off
                    </>
                  )}
                </Button>
              </div>

              {isOwner ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Delete channel
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Removes it and every topic inside for all members. This
                      cannot be undone.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setDeleteError("");
                      setIsConfirmingDelete(true);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </Dialog>

      <ConfirmDialog
        open={memberToRemove !== null}
        title="Remove member?"
        description={
          memberToRemove
            ? `${personDisplayName(memberToRemove.user)} will lose access to this channel and every topic in it.`
            : undefined
        }
        confirmLabel="Remove member"
        pendingLabel="Removing..."
        isPending={busyPhone !== null}
        error={removeError}
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => void handleRemoveMember()}
      />

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this channel?"
        description={`"${channel.name}" and its ${channel.topic_count} ${channel.topic_count === 1 ? "topic" : "topics"} will no longer be reachable by anyone.`}
        confirmLabel="Delete channel"
        pendingLabel="Deleting..."
        isPending={isDeleting}
        error={deleteError}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() => void handleDeleteChannel()}
      />
    </>
  );
}

export { ChannelInfoDialog };
