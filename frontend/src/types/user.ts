export type Gender = "male" | "female";

export interface User {
  id: number | string;
  full_name: string;
  phone_number: string;
  gender: Gender;
  created_at?: string;
  updated_at?: string;
}

export interface RegisterPayload {
  full_name: string;
  phone_number: string;
  gender: Gender;
  password: string;
}

export interface LoginPayload {
  phone_number: string;
  password: string;
}

export interface AuthResponse {
  user?: User;
  message?: string;
  detail?: string;
}