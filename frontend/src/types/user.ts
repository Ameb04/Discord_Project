export type Gender = "male" | "female" | "other" | "";

export type Tag = {
  id: number;
  title: string;
  for_humans: boolean;
};

export type User = {
  id?: number | string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;

  first_name?: string;
  last_name?: string;

  full_name?: string;
  phone_number?: string;
  gender?: Gender;

  can_be_added_to_group?: boolean;
  tag?: number | Tag | null;

  created_at?: string;
  updated_at?: string;
};

export interface RegisterPayload {
  first_name: string;
  last_name?: string;
  phone_number: string;
  gender: Gender;
  password: string;
}

export interface LoginPayload {
  phone_number: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
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
  avatar_url?: string | null;
  tag?: Tag | null;
};
