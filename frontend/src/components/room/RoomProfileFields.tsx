import { Globe, ImagePlus, Lock, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { getTags } from "@/api/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BioField } from "@/components/ui/bio-field";
import { Button } from "@/components/ui/button";
import { CharacterCounter } from "@/components/ui/character-counter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initialsFor } from "@/lib/format";
import { ROOM_NAME_MAX_LENGTH, ROOM_NAME_WARN_REMAINING } from "@/lib/profile";
import type { GroupAccessLevel } from "@/types/chat";
import type { Tag } from "@/types/user";

import { NO_TAG, type RoomProfileDraft } from "./roomProfile";

type RoomProfileFieldsProps = {
  value: RoomProfileDraft;
  onChange: (next: RoomProfileDraft) => void;
  disabled?: boolean;
  /** Current picture, shown until the user picks a replacement. */
  existingAvatarUrl?: string | null;
  /** What this room is called in the form's own labels. */
  nameLabel?: string;
  namePlaceholder?: string;
  bioPlaceholder?: string;
  /** Stands in for the picture before one is chosen and before a name exists. */
  fallbackIcon?: ReactNode;
  /** Offer the public/private choice. Off where the form does not own it. */
  showAccessLevel?: boolean;
  /** Extra controls, rendered under the shared ones. */
  children?: ReactNode;
};

/**
 * Name, bio, tag and picture — the identity every room has.
 *
 * One component for groups, channels and topics because the three genuinely
 * are the same form; the differences (a privacy choice, a posting lock) arrive
 * as props and children rather than as three near-copies that drift apart.
 *
 * The avatar preview is an object URL that is revoked when the chosen file
 * changes or the form unmounts — without that, every re-pick leaks a blob.
 */
function RoomProfileFields({
  value,
  onChange,
  disabled = false,
  existingAvatarUrl = null,
  nameLabel = "Name",
  namePlaceholder = "Weekend hiking crew",
  bioPlaceholder = "What is this about?",
  fallbackIcon,
  showAccessLevel = false,
  children,
}: RoomProfileFieldsProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameId = useId();
  const nameCounterId = useId();
  const accessId = useId();

  useEffect(() => {
    let isCurrent = true;

    // Group tags only — the people tags offered on a profile are a separate
    // vocabulary and would be nonsense here.
    getTags("group")
      .then((nextTags) => {
        if (isCurrent) setTags(nextTags);
      })
      // A missing tag list is not worth blocking creation over.
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, []);

  // Derived rather than stored: the URL is a pure function of the chosen file,
  // and the effect below exists only to release it.
  const previewUrl = useMemo(
    () => (value.avatar ? URL.createObjectURL(value.avatar) : null),
    [value.avatar]
  );

  // Revoke each blob once it stops being rendered — without this, every
  // re-pick leaks the previous one for the life of the page.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const shownAvatar = previewUrl ?? existingAvatarUrl;
  const displayName = value.name.trim() || nameLabel;

  function update(patch: Partial<RoomProfileDraft>) {
    onChange({ ...value, ...patch });
  }

  return (
    // Two columns from `sm` up. Every field here is short, so a single stack
    // made the dialogs around it taller than a laptop viewport and pushed the
    // Save button behind a scroll — pairing them is what keeps the whole form
    // on screen. Only the bio and whatever the caller adds stay full width,
    // where a long line has somewhere to go.
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 shrink-0 border border-border">
          {shownAvatar ? (
            <AvatarImage src={shownAvatar} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-foreground">
            {value.name.trim() ? initialsFor(displayName) : fallbackIcon}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) update({ avatar: file });
              // Let the same file be re-picked after being cleared.
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {shownAvatar ? "Change picture" : "Add picture"}
          </Button>
          {value.avatar ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => update({ avatar: null })}
            >
              <X className="size-4" aria-hidden="true" />
              Undo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={nameId}>{nameLabel}</Label>
          <CharacterCounter
            id={nameCounterId}
            value={value.name}
            max={ROOM_NAME_MAX_LENGTH}
            warnRemaining={ROOM_NAME_WARN_REMAINING}
          />
        </div>
        <Input
          id={nameId}
          value={value.name}
          disabled={disabled}
          maxLength={ROOM_NAME_MAX_LENGTH}
          aria-describedby={nameCounterId}
          placeholder={namePlaceholder}
          // `maxLength` covers typing; the slice covers a paste, which the
          // attribute truncates silently in some browsers and not at all in
          // others.
          onChange={(event) =>
            update({ name: event.target.value.slice(0, ROOM_NAME_MAX_LENGTH) })
          }
        />
      </div>

      <div className="grid content-start gap-2">
        <Label>Tag</Label>
        <Select
          value={value.tagId}
          disabled={disabled}
          onValueChange={(next) => update({ tagId: next })}
        >
          <SelectTrigger>
            <SelectValue placeholder="No tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TAG}>No tag</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={String(tag.id)}>
                {tag.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Beside the tag rather than under it: the two together are exactly one
          row tall, and the bio is the field that benefits from the extra
          height anyway. */}
      <BioField
        value={value.bio}
        disabled={disabled}
        placeholder={bioPlaceholder}
        onChange={(bio) => update({ bio })}
      />

      {showAccessLevel ? (
        // Full width: the options spell out what each one means, and half a
        // row is not enough to read that in.
        <div className="grid content-start gap-2 sm:col-span-2">
          <Label htmlFor={accessId}>Visibility</Label>
          <Select
            value={value.accessLevel}
            disabled={disabled}
            onValueChange={(next) =>
              update({ accessLevel: next as GroupAccessLevel })
            }
          >
            <SelectTrigger id={accessId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                <Globe className="size-4" aria-hidden="true" />
                Public — anyone can find and join
              </SelectItem>
              <SelectItem value="private">
                <Lock className="size-4" aria-hidden="true" />
                Private — invite or admin only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {children ? <div className="sm:col-span-2">{children}</div> : null}
    </div>
  );
}

export { RoomProfileFields };
