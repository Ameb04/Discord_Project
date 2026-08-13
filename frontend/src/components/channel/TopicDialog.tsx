import { Hash, LoaderCircle, Lock, MessagesSquare } from "lucide-react";
import { useState } from "react";

import { createTopic, updateTopic } from "@/api/channels";
import { RoomProfileFields } from "@/components/room/RoomProfileFields";
import {
  draftFromRoom,
  draftToProfileInput,
  emptyRoomProfileDraft,
  type RoomProfileDraft,
} from "@/components/room/roomProfile";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import type { Topic } from "@/types/chat";

type TopicDialogProps = {
  open: boolean;
  channelId: number;
  /** The topic being edited, or undefined to create a new one. */
  topic?: Topic;
  onClose: () => void;
  onSaved: (topic: Topic) => void;
};

/**
 * Create or edit a topic.
 *
 * One dialog for both because the fields are identical — a topic is only ever
 * its identity plus the question of who may post in it, and splitting that
 * into two components would mean maintaining the same form twice.
 */
function TopicDialog({
  open,
  channelId,
  topic,
  onClose,
  onSaved,
}: TopicDialogProps) {
  const [draft, setDraft] = useState<RoomProfileDraft>(() =>
    topic ? draftFromRoom(topic) : emptyRoomProfileDraft("public")
  );
  const [allowMemberMessages, setAllowMemberMessages] = useState(
    topic?.allow_member_messages ?? true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  // Reopening should start from the current topic, not the last abandoned edit.
  const [formKey, setFormKey] = useState(`${open}:${topic?.id ?? "new"}`);

  const nextFormKey = `${open}:${topic?.id ?? "new"}`;
  if (formKey !== nextFormKey) {
    setFormKey(nextFormKey);
    if (open) {
      setDraft(topic ? draftFromRoom(topic) : emptyRoomProfileDraft("public"));
      setAllowMemberMessages(topic?.allow_member_messages ?? true);
      setError("");
    }
  }

  const isEditing = Boolean(topic);
  const canSubmit = Boolean(draft.name.trim()) && !isSaving;

  async function handleSave() {
    if (!canSubmit) return;

    setIsSaving(true);
    setError("");

    const input = {
      ...draftToProfileInput(draft, { includeAccessLevel: true }),
      name: draft.name.trim(),
      allow_member_messages: allowMemberMessages,
    };

    try {
      const saved = topic
        ? await updateTopic(channelId, topic.id, input)
        : await createTopic(channelId, input);
      onSaved(saved);
    } catch (err) {
      setError(
        apiErrorMessage(err, "Could not save this topic. Please try again.", [
          "name",
          "avatar",
        ])
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={isSaving ? () => {} : onClose}
      title={isEditing ? "Edit topic" : "New topic"}
      description={
        isEditing
          ? "Everyone in the channel sees these changes."
          : "Topics are where the conversation actually happens."
      }
      icon={<Hash className="size-4.5" aria-hidden="true" />}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleSave()}>
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : isEditing ? (
              "Save changes"
            ) : (
              "Create topic"
            )}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <RoomProfileFields
          value={draft}
          onChange={setDraft}
          disabled={isSaving}
          existingAvatarUrl={topic?.avatar_url ?? null}
          nameLabel="Topic name"
          namePlaceholder="Course 1"
          bioPlaceholder="What is discussed here?"
          fallbackIcon={<Hash className="size-6" aria-hidden="true" />}
        >
          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground/80">
              Who can post
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              <PostingChoice
                isSelected={allowMemberMessages}
                disabled={isSaving}
                icon={<MessagesSquare className="size-4" aria-hidden="true" />}
                title="Everyone"
                body="Any member of the channel can send messages."
                onSelect={() => setAllowMemberMessages(true)}
              />
              <PostingChoice
                isSelected={!allowMemberMessages}
                disabled={isSaving}
                icon={<Lock className="size-4" aria-hidden="true" />}
                title="Admins only"
                body="Members can read, but only admins can post."
                onSelect={() => setAllowMemberMessages(false)}
              />
            </div>
          </div>
        </RoomProfileFields>

        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Two cards instead of a switch: the consequence of each is worth spelling out. */
function PostingChoice({
  isSelected,
  disabled,
  icon,
  title,
  body,
  onSelect,
}: {
  isSelected: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  body: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "rounded-2xl border px-3 py-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60",
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-sm font-medium",
          isSelected ? "text-foreground" : "text-foreground/80"
        )}
      >
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
        {body}
      </span>
    </button>
  );
}

export { TopicDialog };
