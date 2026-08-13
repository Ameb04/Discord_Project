import { ImagePlus, Users, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
import {
  GROUP_NAME_MAX_LENGTH,
  GROUP_NAME_WARN_REMAINING,
} from "@/lib/profile";
import type { Tag } from "@/types/user";

import { NO_TAG, type GroupProfileDraft } from "./groupProfile";

type GroupProfileFieldsProps = {
  value: GroupProfileDraft;
  onChange: (next: GroupProfileDraft) => void;
  disabled?: boolean;
  /** Current picture, shown until the user picks a replacement. */
  existingAvatarUrl?: string | null;
};

/**
 * Name, bio, tag and picture for a group.
 *
 * The avatar preview is an object URL that is revoked when the chosen file
 * changes or the form unmounts — without that, every re-pick leaks a blob.
 */
function GroupProfileFields({
  value,
  onChange,
  disabled = false,
  existingAvatarUrl = null,
}: GroupProfileFieldsProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameId = useId();
  const nameCounterId = useId();

  useEffect(() => {
    let isCurrent = true;

    // Group tags only — the people tags offered on a profile are a separate
    // vocabulary and would be nonsense here.
    getTags("group")
      .then((nextTags) => {
        if (isCurrent) setTags(nextTags);
      })
      // A missing tag list is not worth blocking group creation over.
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
  const displayName = value.name.trim() || "New group";

  function update(patch: Partial<GroupProfileDraft>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 shrink-0 border border-border">
          {shownAvatar ? (
            <AvatarImage src={shownAvatar} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-foreground">
            {value.name.trim() ? (
              initialsFor(displayName)
            ) : (
              <Users className="size-6" aria-hidden="true" />
            )}
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
          <Label htmlFor={nameId}>Group name</Label>
          <CharacterCounter
            id={nameCounterId}
            value={value.name}
            max={GROUP_NAME_MAX_LENGTH}
            warnRemaining={GROUP_NAME_WARN_REMAINING}
          />
        </div>
        <Input
          id={nameId}
          value={value.name}
          disabled={disabled}
          maxLength={GROUP_NAME_MAX_LENGTH}
          aria-describedby={nameCounterId}
          placeholder="Weekend hiking crew"
          // `maxLength` covers typing; the slice covers a paste, which the
          // attribute truncates silently in some browsers and not at all in
          // others.
          onChange={(event) =>
            update({ name: event.target.value.slice(0, GROUP_NAME_MAX_LENGTH) })
          }
        />
      </div>

      <BioField
        value={value.bio}
        disabled={disabled}
        placeholder="What is this group about?"
        onChange={(bio) => update({ bio })}
      />

      <div className="grid gap-2">
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
    </div>
  );
}

export { GroupProfileFields };
