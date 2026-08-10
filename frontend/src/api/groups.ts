import client from "./client";
import type {
  GroupAccessLevel,
  GroupConversation,
  GroupDetail,
  GroupInvitePreview,
} from "../types/chat";

/**
 * Group profile fields a client may send.
 *
 * `avatar` is a `File` on its way up and a URL on the way down, so it only
 * appears here — never in the response types.
 */
export type GroupProfileInput = {
  name?: string;
  bio?: string;
  tag?: number | null;
  avatar?: File | null;
  allow_media?: boolean;
  access_level?: GroupAccessLevel;
};

/**
 * Encode a profile edit, choosing the wire format from the payload itself.
 *
 * A file forces multipart; everything else goes as JSON, which keeps `null`
 * (clear the tag) and booleans meaningful instead of collapsing to the strings
 * `"null"` and `"false"` that a FormData round-trip would produce.
 */
function encodeProfile(input: GroupProfileInput) {
  if (!(input.avatar instanceof File)) {
    // `avatar: null` would ask the server to clear the picture, which is not
    // what "no new file chosen" means — so drop the key rather than send it.
    const data: Record<string, unknown> = { ...input };
    delete data.avatar;
    return { data, config: undefined };
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value instanceof File) {
      formData.append(key, value);
    } else if (value === null) {
      formData.append(key, "");
    } else {
      formData.append(key, String(value));
    }
  }

  return {
    data: formData,
    config: { headers: { "Content-Type": "multipart/form-data" } },
  };
}

export async function getGroups(): Promise<GroupConversation[]> {
  const response = await client.get<GroupConversation[]>("/api/groups/");
  return response.data;
}

export async function getGroup(groupId: number): Promise<GroupDetail> {
  const response = await client.get<GroupDetail>(`/api/groups/${groupId}/`);
  return response.data;
}

export async function createGroup(
  input: GroupProfileInput & { name: string }
): Promise<GroupDetail> {
  const { data, config } = encodeProfile(input);
  const response = await client.post<GroupDetail>("/api/groups/", data, config);
  return response.data;
}

export async function updateGroup(
  groupId: number,
  input: GroupProfileInput
): Promise<GroupDetail> {
  const { data, config } = encodeProfile(input);
  const response = await client.patch<GroupDetail>(
    `/api/groups/${groupId}/`,
    data,
    config
  );
  return response.data;
}

export async function deleteGroup(groupId: number): Promise<void> {
  await client.delete(`/api/groups/${groupId}/`);
}

export async function addGroupMember(
  groupId: number,
  phoneNumber: string
): Promise<GroupDetail> {
  const response = await client.post<GroupDetail>(
    `/api/groups/${groupId}/members/`,
    { user: phoneNumber }
  );
  return response.data;
}

export async function removeGroupMember(
  groupId: number,
  phoneNumber: string
): Promise<void> {
  await client.delete(
    `/api/groups/${groupId}/members/${encodeURIComponent(phoneNumber)}/`
  );
}

export async function getGroupInvite(token: string): Promise<GroupInvitePreview> {
  const response = await client.get<GroupInvitePreview>(
    `/api/groups/join/${encodeURIComponent(token)}/`
  );
  return response.data;
}

export async function joinGroup(token: string): Promise<GroupDetail> {
  const response = await client.post<GroupDetail>(
    `/api/groups/join/${encodeURIComponent(token)}/`
  );
  return response.data;
}

/** Absolute URL for an invite token, for copying and sharing. */
export function inviteUrlFor(token: string) {
  return `${window.location.origin}/join/${token}`;
}
