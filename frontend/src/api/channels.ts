import client from "./client";
import { encodeProfile } from "./encodeProfile";
import type {
  ChannelDetail,
  ChannelConversation,
  ChannelInvitePreview,
  GroupAccessLevel,
  Topic,
} from "../types/chat";

/**
 * Channel profile fields a client may send.
 *
 * `avatar` is a `File` on its way up and a URL on the way down, so it only
 * appears here — never in the response types.
 */
export type ChannelProfileInput = {
  name?: string;
  bio?: string;
  tag?: number | null;
  avatar?: File | null;
  allow_media?: boolean;
  access_level?: GroupAccessLevel;
};

/** Everything a topic carries, including its posting lock. */
export type TopicProfileInput = {
  name?: string;
  bio?: string;
  tag?: number | null;
  avatar?: File | null;
  access_level?: GroupAccessLevel;
  allow_member_messages?: boolean;
};

export async function getChannels(): Promise<ChannelDetail[]> {
  const response = await client.get<ChannelDetail[]>("/api/channels/");
  return response.data;
}

/**
 * Browse public channels. Private ones never appear here, whatever the query.
 */
export async function discoverChannels(
  query = ""
): Promise<ChannelConversation[]> {
  const response = await client.get<ChannelConversation[]>(
    "/api/channels/discover/",
    { params: query ? { q: query } : undefined }
  );
  return response.data;
}

/**
 * Load one channel.
 *
 * Works for a non-member looking at a public channel too — they get its
 * profile and topic list, with `members` empty and `invite_link` null.
 */
export async function getChannel(channelId: number): Promise<ChannelDetail> {
  const response = await client.get<ChannelDetail>(
    `/api/channels/${channelId}/`
  );
  return response.data;
}

export async function createChannel(
  input: ChannelProfileInput & { name: string }
): Promise<ChannelDetail> {
  const { data, config } = encodeProfile(input);
  const response = await client.post<ChannelDetail>(
    "/api/channels/",
    data,
    config
  );
  return response.data;
}

export async function updateChannel(
  channelId: number,
  input: ChannelProfileInput
): Promise<ChannelDetail> {
  const { data, config } = encodeProfile(input);
  const response = await client.patch<ChannelDetail>(
    `/api/channels/${channelId}/`,
    data,
    config
  );
  return response.data;
}

export async function deleteChannel(channelId: number): Promise<void> {
  await client.delete(`/api/channels/${channelId}/`);
}

export async function addChannelMember(
  channelId: number,
  phoneNumber: string
): Promise<ChannelDetail> {
  const response = await client.post<ChannelDetail>(
    `/api/channels/${channelId}/members/`,
    { user: phoneNumber }
  );
  return response.data;
}

export async function removeChannelMember(
  channelId: number,
  phoneNumber: string
): Promise<ChannelDetail> {
  const response = await client.delete<ChannelDetail>(
    `/api/channels/${channelId}/members/${encodeURIComponent(phoneNumber)}/`
  );
  return response.data;
}

/** Promote or demote a member. Owner-only on the server. */
export async function setChannelAdmin(
  channelId: number,
  phoneNumber: string,
  isAdmin: boolean
): Promise<ChannelDetail> {
  const response = await client.patch<ChannelDetail>(
    `/api/channels/${channelId}/members/${encodeURIComponent(phoneNumber)}/`,
    { is_admin: isAdmin }
  );
  return response.data;
}

/** Issue a new invite token, which stops the previous link from working. */
export async function resetChannelInvite(
  channelId: number
): Promise<ChannelDetail> {
  const response = await client.post<ChannelDetail>(
    `/api/channels/${channelId}/invite/reset/`
  );
  return response.data;
}

/** Join a public channel of one's own accord. Private ones need an invite. */
export async function joinChannel(channelId: number): Promise<ChannelDetail> {
  const response = await client.post<ChannelDetail>(
    `/api/channels/${channelId}/join/`
  );
  return response.data;
}

export async function getChannelInvite(
  token: string
): Promise<ChannelInvitePreview> {
  const response = await client.get<ChannelInvitePreview>(
    `/api/channels/join/${encodeURIComponent(token)}/`
  );
  return response.data;
}

export async function joinChannelViaInvite(
  token: string
): Promise<ChannelDetail> {
  const response = await client.post<ChannelDetail>(
    `/api/channels/join/${encodeURIComponent(token)}/`
  );
  return response.data;
}

export async function createTopic(
  channelId: number,
  input: TopicProfileInput & { name: string }
): Promise<Topic> {
  const { data, config } = encodeProfile(input);
  const response = await client.post<Topic>(
    `/api/channels/${channelId}/topics/`,
    data,
    config
  );
  return response.data;
}

export async function updateTopic(
  channelId: number,
  topicId: number,
  input: TopicProfileInput
): Promise<Topic> {
  const { data, config } = encodeProfile(input);
  const response = await client.patch<Topic>(
    `/api/channels/${channelId}/topics/${topicId}/`,
    data,
    config
  );
  return response.data;
}

export async function deleteTopic(
  channelId: number,
  topicId: number
): Promise<void> {
  await client.delete(`/api/channels/${channelId}/topics/${topicId}/`);
}

/** Absolute URL for a channel invite token, for copying and sharing. */
export function channelInviteUrlFor(token: string) {
  return `${window.location.origin}/join/channel/${token}`;
}
