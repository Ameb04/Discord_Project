import client from "./client";
import type { ChangePasswordPayload, LoginPayload, RegisterPayload, User } from "../types/user";

export async function ensureCsrfCookie(): Promise<void> {
  await client.get("/api/auth/csrf/");
}

export async function register(payload: RegisterPayload) {
  const response = await client.post<User>("/api/auth/register/", payload);
  return response.data;
}

export async function login(payload: LoginPayload) {
  const response = await client.post<User>("/api/auth/login/", payload);
  return response.data;
}

export async function logout(): Promise<void> {
  await client.post("/api/auth/logout/");
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await client.post("/api/auth/change-password/", payload);
}