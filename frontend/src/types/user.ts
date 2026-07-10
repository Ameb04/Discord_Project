export type Gender = "male" | "female" | "other" | "";

export type User = {
  id: number | string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;

  first_name?: string;
  last_name?: string;

  full_name?: string;
  phone_number?: string;
  gender?: Gender;

  can_be_added_to_group?: boolean;
  tag?: number | null;

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
