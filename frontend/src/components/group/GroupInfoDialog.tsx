import {
  Check,
  Copy,
  Crown,
  ImageOff,
  Images,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  addGroupMember,
  deleteGroup,
  getGroup,
  inviteUrlFor,
  removeGroupMember,
  resetGroupInvite,
  updateGroup,
} from "@/api/groups";
import { AnimatedListItem, AnimatedListPresence } from "@/components/motion/AnimatedList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { apiErrorMessage } from "@/lib/apiError";
import { initialsFor, personDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GroupDetail, GroupMember } from "@/types/chat";

import { MemberAdder } from "@/components/room/MemberAdder";
import { RoomProfileFields } from "@/components/room/RoomProfileFields";
import {
  draftFromRoom,
  draftToProfileInput,
  type RoomProfileDraft,
} from "@/components/room/roomProfile";

type GroupInfoDialogProps = {
  open: boolean;
  groupId: number;
  onClose: () => void;
  /** Fired whenever the group changes, so the sidebar can refresh. */
  onGroupChanged?: (group: GroupDetail) => void;
  /** Fired after the owner deletes the group, so the caller can navigate away. */
  onGroupDeleted?: () => void;
  /** Opens a member's profile. Owned by the caller so the profile dialog is
   *  mounted once for the conversation rather than once per member row. */
  onOpenProfile?: (phoneNumber: string) => void;
};

function MemberRow({
  member,
  canRemove,
  isRemoving,
  onRemove,
  onOpenProfile,
}: {
  member: GroupMember;
  canRemove: boolean;
  isRemoving: boolean;
  onRemove: () => void;
  onOpenProfile?: (phoneNumber: string) => void;
}) {
  const displayName = personDisplayName(member.user, "Unnamed user");

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-3 py-2">
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
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {member.user.tag
            ? `${member.user.phone_number} · ${member.user.tag.title}`
            : member.user.phone_number}
        </p>
      </button>

      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 hover:text-red-300"
          disabled={isRemoving}
          aria-label={`Remove ${displayName} from the group`}
          onClick={onRemove}
        >
          {isRemoving ? (
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
 * Everything behind a group's name: who is in it, what it is, and — for the
 * owner — the controls to change any of that.
 *
 * The dialog owns the authoritative copy of the group. It loads on open rather
 * than taking a prop, so the member list is never a stale snapshot from the
 * sidebar, and every mutation swaps in the server's response.
 */
function GroupInfoDialog({
  open,
  groupId,
  onClose,
  onGroupChanged,
  onGroupDeleted,
  onOpenProfile,
}: GroupInfoDialogProps) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RoomProfileDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [removingPhone, setRemovingPhone] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(null);
  const [removeError, setRemoveError] = useState("");

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isResettingInvite, setIsResettingInvite] = useState(false);

  const { hasCopied, copy } = useCopyFeedback();

  // Loaded on open rather than taken as a prop, so the member list is always
  // the server's current answer instead of a stale sidebar snapshot.
  useEffect(() => {
    if (!open) return;

    let isCurrent = true;

    async function loadGroup() {
      setIsLoading(true);
      setLoadError("");
      setIsEditing(false);
      setSaveError("");
      setRemoveError("");

      try {
        const nextGroup = await getGroup(groupId);
        if (isCurrent) setGroup(nextGroup);
      } catch (err) {
        if (isCurrent) {
          setGroup(null);
          setLoadError(apiErrorMessage(err, "Could not load this group."));
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadGroup();

    return () => {
      isCurrent = false;
    };
  }, [groupId, open]);

  function applyGroup(nextGroup: GroupDetail) {
    setGroup(nextGroup);
    onGroupChanged?.(nextGroup);
  }

  function startEditing() {
    if (!group) return;
    setDraft(draftFromRoom(group));
    setSaveError("");
    setIsEditing(true);
  }

  async function handleSaveProfile() {
    if (!group || !draft || !draft.name.trim()) return;

    setIsSaving(true);
    setSaveError("");

    try {
      applyGroup(await updateGroup(group.id, draftToProfileInput(draft)));
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
    if (!group) return;

    setSaveError("");
    try {
      applyGroup(await updateGroup(group.id, { allow_media: !group.allow_media }));
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not change the media setting."));
    }
  }

  async function handleRemoveMember() {
    if (!group || !memberToRemove) return;

    const phoneNumber = memberToRemove.user.phone_number;
    setRemovingPhone(phoneNumber);
    setRemoveError("");

    try {
      await removeGroupMember(group.id, phoneNumber);
      applyGroup(await getGroup(group.id));
      setMemberToRemove(null);
    } catch (err) {
      setRemoveError(apiErrorMessage(err, "Could not remove this member."));
    } finally {
      setRemovingPhone(null);
    }
  }

  async function handleDeleteGroup() {
    if (!group) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteGroup(group.id);
      setIsConfirmingDelete(false);
      onGroupDeleted?.();
      onClose();
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Could not delete this group."));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleResetInvite() {
    if (!group) return;

    setIsResettingInvite(true);
    setSaveError("");

    try {
      applyGroup(await resetGroupInvite(group.id));
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Could not issue a new invite link."));
    } finally {
      setIsResettingInvite(false);
    }
  }

  const isOwner = Boolean(group?.is_owner);
  const canSaveProfile = Boolean(draft?.name.trim()) && !isSaving;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={group?.name || "Group"}
        description={
          group
            ? `${group.member_count} ${group.member_count === 1 ? "member" : "members"}`
            : undefined
        }
        icon={<Users className="size-4.5" aria-hidden="true" />}
        className="sm:max-w-xl"
      >
        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        ) : loadError ? (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
          >
            {loadError}
          </p>
        ) : group ? (
          <div className="grid gap-5">
            {isEditing && draft ? (
              <section className="grid gap-4">
                <RoomProfileFields
                  value={draft}
                  onChange={setDraft}
                  disabled={isSaving}
                  existingAvatarUrl={group.avatar_url}
                  nameLabel="Group name"
                  namePlaceholder="Weekend hiking crew"
                  bioPlaceholder="What is this group about?"
                  fallbackIcon={<Users className="size-6" aria-hidden="true" />}
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
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
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
                  {group.avatar_url ? (
                    <AvatarImage src={group.avatar_url} alt={group.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-foreground">
                    {initialsFor(group.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-lg font-semibold text-foreground">
                      {group.name}
                    </h3>
                    {group.tag ? (
                      <Badge variant="secondary">{group.tag.title}</Badge>
                    ) : null}
                  </div>

                  {group.bio.trim() ? (
                    <p className="mt-1.5 text-sm leading-6 break-words whitespace-pre-wrap text-muted-foreground">
                      {group.bio}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted-foreground/70">
                      No bio yet.
                    </p>
                  )}

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
                    <span className="inline-flex items-center gap-1">
                      <Crown className="size-3.5" aria-hidden="true" />
                      {personDisplayName(group.owner)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      {group.allow_media ? (
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

                {isOwner ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={startEditing}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </Button>
                ) : null}
              </section>
            )}

            {/* `min-w-0` at both grid levels below, for the reason spelled out
                in `ChannelInfoDialog`: an unbreakable invite URL widens an
                `auto` track past the panel and the dialog scrolls sideways. */}
            {group.invite_link ? (
              <section className="grid min-w-0 gap-2">
                <p className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                  <Link2 className="size-3.5" aria-hidden="true" />
                  Invite link
                </p>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                    {inviteUrlFor(group.invite_link)}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void copy(inviteUrlFor(group.invite_link ?? ""))}
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
                  {isOwner ? (
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
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <RefreshCw className="size-4" aria-hidden="true" />
                      )}
                      New link
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Anyone who opens this link joins the group.
                  {isOwner
                    ? " Generating a new one immediately stops the old link from working."
                    : null}
                </p>
              </section>
            ) : null}

            {isOwner ? (
              <section className="grid gap-2">
                <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                  Add members
                </p>
                <MemberAdder
                  roomLabel="group"
                  memberPhones={
                    new Set(
                      group.members.map((member) => member.user.phone_number)
                    )
                  }
                  onAdd={async (user) => {
                    applyGroup(await addGroupMember(group.id, user.phone_number));
                  }}
                />
              </section>
            ) : null}

            <section className="grid gap-2">
              <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                Members ({group.members.length})
              </p>

              {/* A removal failure is reported inside the confirmation, which
                  stays open on error — repeating it here would double-report. */}
              <ul className="grid gap-1.5">
                <AnimatedListPresence reorder>
                  {group.members.map((member, index) => (
                    <AnimatedListItem key={member.user.phone_number} index={index} reorder>
                      <MemberRow
                        member={member}
                        // The owner can remove anyone but themselves.
                        canRemove={isOwner && !member.is_owner}
                        isRemoving={removingPhone === member.user.phone_number}
                        onRemove={() => {
                          setRemoveError("");
                          setMemberToRemove(member);
                        }}
                        onOpenProfile={onOpenProfile}
                      />
                    </AnimatedListItem>
                  ))}
                </AnimatedListPresence>
              </ul>
            </section>

            {isOwner ? (
              <section className="grid gap-3 rounded-2xl border border-border bg-white/[0.02] p-4">
                <p className="text-xs font-medium tracking-[0.14em] text-primary/80 uppercase">
                  Owner controls
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Allow media
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Members can attach files and images when this is on.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={group.allow_media ? "default" : "outline"}
                    size="sm"
                    className="shrink-0"
                    aria-pressed={group.allow_media}
                    onClick={() => void handleToggleMedia()}
                  >
                    {group.allow_media ? (
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

                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Delete group
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Removes it for every member. This cannot be undone.
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
              </section>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={memberToRemove !== null}
        title="Remove member?"
        description={
          memberToRemove
            ? `${personDisplayName(memberToRemove.user)} will lose access to this group.`
            : undefined
        }
        confirmLabel="Remove member"
        pendingLabel="Removing..."
        isPending={removingPhone !== null}
        error={removeError}
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => void handleRemoveMember()}
      />

      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this group?"
        description={
          group
            ? `"${group.name}" and its conversation will no longer be reachable by anyone.`
            : undefined
        }
        confirmLabel="Delete group"
        pendingLabel="Deleting..."
        isPending={isDeleting}
        error={deleteError}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() => void handleDeleteGroup()}
      />
    </>
  );
}

export { GroupInfoDialog };
