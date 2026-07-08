import client from "./client";
import type { User, PublicUser } from "../types/user";

export async function getMe() {
  const response = await client.get<User>("/api/auth/me/");
  return response.data;
}

export async function searchUsers(query: string): Promise<User[]> {
  const response = await client.get<User[]>("/api/users/search/", {
    params: { q: query },
  });

  if (!Array.isArray(response.data)) {
    throw new Error("Unexpected user search response.");
  }

  return response.data;
}

export async function getUser(phone_number: string): Promise<User> {
  const response = await client.get<User>(
    `/api/users/${phone_number}/`
  );

  return response.data;
}

export async function getUserProfile(
  phone_number: string
): Promise<PublicUser> {
  const response = await client.get<PublicUser>(
    `/api/users/${phone_number}/`
  );

  return response.data;
}