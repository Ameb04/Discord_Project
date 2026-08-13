export type Gender = "male" | "female" | "other" | "";

export type Tag = {
  id: number;
  title: string;
  for_humans: boolean;
};

/**
 * The signed-in user's own profile, as returned by `GET /api/auth/me/`.
 *
 * Fields are optional because the same shape backs the "not loaded yet" state
 * in `AuthContext`. `tag` arrives as a bare id from this endpoint but as a
 * nested object from the public profile endpoint, so both are accepted.
 */
export type User = {
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  gender?: Gender;
  can_be_added_to_group?: boolean;
  avatar_url?: string | null;
  tag?: number | Tag | null;
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

export type PublicUser = {
  phone_number: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  avatar_url?: string | null;
  tag?: Tag | null;
};
