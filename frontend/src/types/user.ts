export type Gender = "male" | "female" | "other" | "";

/** Who a tag may be attached to. The two vocabularies never mix. */
export type TagScope = "user" | "group";

export type Tag = {
  id: number;
  title: string;
  scope: TagScope;
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
  bio?: string;
  can_be_added_to_group?: boolean;
  can_be_added_to_channel?: boolean;
  avatar_url?: string | null;
  tag?: number | Tag | null;
};

export interface RegisterPayload {
  first_name: string;
  last_name?: string;
  phone_number: string;
  gender: Gender;
  password: string;
  bio?: string;
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
  bio?: string;
  avatar_url?: string | null;
  tag?: Tag | null;
};
