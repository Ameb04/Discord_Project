import client from "./client";
import { encodeProfile } from "./encodeProfile";
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

/** Issue a new invite token, which stops the previous link from working. */
export async function resetGroupInvite(groupId: number): Promise<GroupDetail> {
  const response = await client.post<GroupDetail>(
    `/api/groups/${groupId}/invite/reset/`
  );
  return response.data;
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
