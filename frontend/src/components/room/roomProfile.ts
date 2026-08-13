/**
 * The editable half of a room's identity, shared by groups, channels and
 * topics — every create dialog and every owner's edit form.
 *
 * Kept apart from the component that renders it so both files stay
 * fast-refreshable — a module that mixes components with plain values loses
 * hot reloading for everything in it.
 */

import type { GroupAccessLevel } from "@/types/chat";

/** Sentinel for "no tag": a Select needs a real value, and "" is not one. */
export const NO_TAG = "none";

export type RoomProfileDraft = {
  name: string;
  bio: string;
  /** A tag id as a string, or `NO_TAG`. */
  tagId: string;
  /** A newly picked file, or null to keep whatever the room already has. */
  avatar: File | null;
  accessLevel: GroupAccessLevel;
};

/** Anything with the profile fields every room shares. */
type RoomProfileSource = {
  name: string;
  bio: string;
  tag: { id: number } | null;
  access_level: GroupAccessLevel;
};

export function emptyRoomProfileDraft(
  accessLevel: GroupAccessLevel = "private"
): RoomProfileDraft {
  return { name: "", bio: "", tagId: NO_TAG, avatar: null, accessLevel };
}

export function draftFromRoom(room: RoomProfileSource): RoomProfileDraft {
  return {
    name: room.name,
    bio: room.bio,
    tagId: room.tag ? String(room.tag.id) : NO_TAG,
    avatar: null,
    accessLevel: room.access_level,
  };
}

/**
 * Translate a draft into the shape the rooms API accepts.
 *
 * `includeAccessLevel` is opt-in because not every form offers the choice —
 * sending the draft's default from a form that never showed it would quietly
 * overwrite a setting the user did not touch.
 */
export function draftToProfileInput(
  draft: RoomProfileDraft,
  { includeAccessLevel = false } = {}
) {
  return {
    name: draft.name.trim(),
    bio: draft.bio.trim(),
    tag: draft.tagId === NO_TAG ? null : Number(draft.tagId),
    // Omitted unless a new file was chosen, so saving the form without
    // touching the picture leaves the existing one alone.
    ...(draft.avatar ? { avatar: draft.avatar } : {}),
    ...(includeAccessLevel ? { access_level: draft.accessLevel } : {}),
  };
}
