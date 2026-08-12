import { LoaderCircle, UsersRound } from "lucide-react";
import { useState } from "react";

import { createGroup } from "@/api/groups";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/apiError";
import type { GroupDetail } from "@/types/chat";

import { GroupProfileFields } from "./GroupProfileFields";
import {
  draftToProfileInput,
  emptyGroupProfileDraft,
  type GroupProfileDraft,
} from "./groupProfile";

type CreateGroupDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the created group so the caller can refresh and navigate. */
  onCreated: (group: GroupDetail) => void;
};

/**
 * Create a group.
 *
 * The creator becomes its owner, which is the only role that can edit the
 * profile or manage members — so this deliberately collects nothing else:
 * members and the media switch are handled from the group's own panel.
 */
function CreateGroupDialog({ open, onClose, onCreated }: CreateGroupDialogProps) {
  const [draft, setDraft] = useState<GroupProfileDraft>(emptyGroupProfileDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  // Reopening should start from a blank form, not the last abandoned draft.
  const [wasOpen, setWasOpen] = useState(open);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setDraft(emptyGroupProfileDraft());
      setError("");
    }
  }

  const canSubmit = Boolean(draft.name.trim()) && !isSaving;

  async function handleCreate() {
    if (!canSubmit) return;

    setIsSaving(true);
    setError("");

    try {
      const group = await createGroup({
        ...draftToProfileInput(draft),
        name: draft.name.trim(),
      });
      onCreated(group);
    } catch (err) {
      setError(
        apiErrorMessage(err, "Could not create this group. Please try again.", [
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
      title="New group"
      description="You will own this group and can invite people once it exists."
      icon={<UsersRound className="size-4.5" aria-hidden="true" />}
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
              "Create group"
            )}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <GroupProfileFields
          value={draft}
          onChange={setDraft}
          disabled={isSaving}
        />

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

export { CreateGroupDialog };
