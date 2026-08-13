/**
 * The editable half of a group's identity, shared by the create dialog and the
 * owner's edit form.
 *
 * Kept apart from the component that renders it so both files stay
 * fast-refreshable — a module that mixes components with plain values loses
 * hot reloading for everything in it.
 */

import type { GroupDetail } from "@/types/chat";

/** Sentinel for "no tag": a Select needs a real value, and "" is not one. */
export const NO_TAG = "none";

export type GroupProfileDraft = {
  name: string;
  bio: string;
  /** A tag id as a string, or `NO_TAG`. */
  tagId: string;
  /** A newly picked file, or null to keep whatever the group already has. */
  avatar: File | null;
};

export function emptyGroupProfileDraft(): GroupProfileDraft {
  return { name: "", bio: "", tagId: NO_TAG, avatar: null };
}

export function draftFromGroup(group: GroupDetail): GroupProfileDraft {
  return {
    name: group.name,
    bio: group.bio,
    tagId: group.tag ? String(group.tag.id) : NO_TAG,
    avatar: null,
  };
}

/** Translate a draft into the shape the groups API accepts. */
export function draftToProfileInput(draft: GroupProfileDraft) {
  return {
    name: draft.name.trim(),
    bio: draft.bio.trim(),
    tag: draft.tagId === NO_TAG ? null : Number(draft.tagId),
    // Omitted unless a new file was chosen, so saving the form without
    // touching the picture leaves the existing one alone.
    ...(draft.avatar ? { avatar: draft.avatar } : {}),
  };
}
