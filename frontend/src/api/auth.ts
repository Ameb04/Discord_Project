import client from "./client";
import type { AuthResponse, LoginPayload, RegisterPayload } from "../types/user";

export async function register(payload: RegisterPayload) {
  const response = await client.post<AuthResponse>("/api/auth/register/", payload);
  return response.data;
}

export async function login(payload: LoginPayload) {
  const response = await client.post<AuthResponse>("/api/auth/login/", payload);
  return response.data;
}

export async function logout(): Promise<void> {
  await client.post("/api/auth/logout/");
}