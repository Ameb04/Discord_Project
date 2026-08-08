import client from "./client";
import type { PublicUser, Tag, TagScope, User } from "../types/user";

export async function getMe() {
  const response = await client.get<User>("/api/auth/me/");
  return response.data;
}

export async function searchUsers(query: string): Promise<PublicUser[]> {
  const response = await client.get<PublicUser[]>("/api/users/search/", {
    params: { q: query },
  });

  if (!Array.isArray(response.data)) {
    throw new Error("Unexpected user search response.");
  }

  return response.data;
}

export async function getUserProfile(phoneNumber: string): Promise<PublicUser> {
  const response = await client.get<PublicUser>(`/api/users/${phoneNumber}/`);
  return response.data;
}

/** Tags offered for one audience — people by default, or groups and channels. */
export async function getTags(scope: TagScope = "user"): Promise<Tag[]> {
  const response = await client.get<Tag[]>("/api/tags/", { params: { scope } });
  return response.data;
}

export async function updateMe(data: Partial<User>) {
  const response = await client.patch<User>("/api/auth/me/", data);
  return response.data;
}

export async function updateMeWithAvatar(formData: FormData) {
  const response = await client.patch<User>("/api/auth/me/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}
