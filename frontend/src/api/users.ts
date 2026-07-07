import client from "./client";
import type { User } from "../types/user";

export async function getMe() {
  const response = await client.get<User>("/api/auth/me/");
  return response.data;
}