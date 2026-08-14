import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

type MuteToggleButtonProps = {
  isMuted: boolean;
  /** Persist the new state; resolves with what the server settled on. */
  onToggle: (muted: boolean) => Promise<boolean>;
  /** Called once the change is saved, so the caller can refresh its copy. */
  onToggled?: (muted: boolean) => void;
  /** What is being silenced, for the button's accessible name. */
  conversationLabel: string;
  /**
   * Why this conversation is already silent for a reason of its own — a topic
   * inside a muted channel. Given, the button reports the silence and steps
   * aside: toggling the topic's own mute would change nothing the reader can
   * see, and a control that appears to do nothing is worse than one that
   * explains why it is not the right one.
   */
  inheritedMuteReason?: string;
  className?: string;
};

/**
 * The bell in a conversation header: notifications on, or off.
 *
 * A single icon button rather than a menu item — muting is a thing people flip
 * back and forth as a room gets noisy, and burying it a click deep makes it
 * feel like a setting rather than a switch. The struck-through bell doubles as
 * the state readout, which is why the header needs no separate "muted" label.
 */
export function MuteToggleButton({
  isMuted,
  onToggle,
  onToggled,
  conversationLabel,
  inheritedMuteReason,
  className,
}: MuteToggleButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  /**
   * What this click asked for, and the value it was asked against.
   *
   * Saving refetches the whole conversation list, so without an optimistic
   * value the bell would sit on its old state for a round trip after a switch
   * that should feel immediate. Recording *what it was asked against* is what
   * retires it without an effect: the moment the caller's copy reads anything
   * other than that, the real answer has landed and the guess is stale.
   */
  const [request, setRequest] = useState<{
    muted: boolean;
    askedAgainst: boolean;
  } | null>(null);

  const pendingMuted =
    request && request.askedAgainst === isMuted ? request.muted : null;

  const isInherited = Boolean(inheritedMuteReason);
  const shownAsMuted = isInherited || (pendingMuted ?? isMuted);

  async function handleClick() {
    if (isSaving || isInherited) return;

    const nextMuted = !(pendingMuted ?? isMuted);
    setIsSaving(true);
    setError("");
    setRequest({ muted: nextMuted, askedAgainst: isMuted });

    try {
      const savedMuted = await onToggle(nextMuted);
      setRequest({ muted: savedMuted, askedAgainst: isMuted });
      onToggled?.(savedMuted);
    } catch (err) {
      setRequest(null);
      setError(apiErrorMessage(err, "Could not change notifications."));
    } finally {
      setIsSaving(false);
    }
  }

  const label = isInherited
    ? inheritedMuteReason
    : shownAsMuted
      ? `Unmute ${conversationLabel}`
      : `Mute ${conversationLabel}`;

  return (
    <Button
      type="button"
      variant={shownAsMuted ? "secondary" : "outline"}
      size="icon"
      className={cn("size-9 shrink-0", className)}
      disabled={isSaving || isInherited}
      aria-label={label}
      aria-pressed={shownAsMuted}
      // A failed toggle has nowhere better to go in a header this tight, and it
      // is rare enough that the tooltip is a fair place for it.
      title={error || label}
      onClick={() => void handleClick()}
    >
      {isSaving ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : shownAsMuted ? (
        <BellOff className="size-4 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export default MuteToggleButton;
