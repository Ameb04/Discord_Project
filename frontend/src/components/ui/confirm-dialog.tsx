import { LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Extra detail rendered above the actions — a message preview, a name. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shown in place of the actions while the confirmed action is running. */
  pendingLabel?: string;
  isPending?: boolean;
  error?: string;
  /** Styles the primary action as destructive. Defaults to true. */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * "Are you sure?" for actions that cannot be undone.
 *
 * Owns only the presentation: the caller keeps the pending and error state, so
 * the dialog can stay open and show why an action failed instead of closing
 * optimistically and losing the reason.
 */
function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pendingLabel = "Working...",
  isPending = false,
  error,
  destructive = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // A destructive action should not vanish mid-flight; ignore dismissals
      // until it settles one way or the other.
      onClose={isPending ? () => {} : onCancel}
      title={title}
      description={description}
      icon={<TriangleAlert className="size-4.5" aria-hidden="true" />}
      className="sm:max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        {children}
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

export { ConfirmDialog };
