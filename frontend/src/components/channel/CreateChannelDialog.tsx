import { LoaderCircle, Radio } from "lucide-react";
import { useState } from "react";

import { createChannel } from "@/api/channels";
import { RoomProfileFields } from "@/components/room/RoomProfileFields";
import {
  draftToProfileInput,
  emptyRoomProfileDraft,
  type RoomProfileDraft,
} from "@/components/room/roomProfile";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/apiError";
import type { ChannelDetail } from "@/types/chat";

type CreateChannelDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the created channel so the caller can refresh and navigate. */
  onCreated: (channel: ChannelDetail) => void;
};

/**
 * Create a channel.
 *
 * The creator becomes its owner — the only role that can promote admins or
 * delete it. Topics, members and the media switch all live in the channel's
 * own panel, so this collects nothing but its identity and who may find it.
 */
function CreateChannelDialog({ open, onClose, onCreated }: CreateChannelDialogProps) {
  // Public by default: a channel is a place people are meant to find, and the
  // private ones are the deliberate exception.
  const [draft, setDraft] = useState<RoomProfileDraft>(() =>
    emptyRoomProfileDraft("public")
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  // Reopening should start from a blank form, not the last abandoned draft.
  const [wasOpen, setWasOpen] = useState(open);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDraft(emptyRoomProfileDraft("public"));
      setError("");
    }
  }

  const canSubmit = Boolean(draft.name.trim()) && !isSaving;

  async function handleCreate() {
    if (!canSubmit) return;

    setIsSaving(true);
    setError("");

    try {
      const channel = await createChannel({
        ...draftToProfileInput(draft, { includeAccessLevel: true }),
        name: draft.name.trim(),
      });
      onCreated(channel);
    } catch (err) {
      setError(
        apiErrorMessage(err, "Could not create this channel. Please try again.", [
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
      title="New channel"
      description="A channel holds topics. You will own it and can add topics once it exists."
      icon={<Radio className="size-4.5" aria-hidden="true" />}
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
          <Button type="button" disabled={!canSubmit} onClick={() => void handleCreate()}>
            {isSaving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Creating...
              </>
            ) : (
              "Create channel"
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
          showAccessLevel
          nameLabel="Channel name"
          namePlaceholder="University A"
          bioPlaceholder="What is this channel about?"
          fallbackIcon={<Radio className="size-6" aria-hidden="true" />}
        />

        <p className="text-xs text-muted-foreground/80">
          Channel names are unique across the whole app, so pick something
          people would search for.
        </p>

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

export { CreateChannelDialog };
