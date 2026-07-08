export type Gender = "male" | "female";

export type User = {
  id: number | string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  full_name?: string;
  phone_number?: string;
  gender?: Gender;
  created_at?: string;
  updated_at?: string;
};

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

export type PublicUser = {
  phone_number: string;
  first_name: string;
  last_name: string;
  gender: Gender;
};