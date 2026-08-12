/** Wire encoding shared by every room profile: groups, channels and topics. */

export type RoomProfileInput = Record<string, unknown> & {
  avatar?: File | null;
};

/**
 * Encode a profile edit, choosing the wire format from the payload itself.
 *
 * A file forces multipart; everything else goes as JSON, which keeps `null`
 * (clear the tag) and booleans meaningful instead of collapsing to the strings
 * `"null"` and `"false"` that a FormData round-trip would produce.
 */
export function encodeProfile(input: RoomProfileInput) {
  if (!(input.avatar instanceof File)) {
    // `avatar: null` would ask the server to clear the picture, which is not
    // what "no new file chosen" means — so drop the key rather than send it.
    const data: Record<string, unknown> = { ...input };
    delete data.avatar;
    return { data, config: undefined };
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value instanceof File) {
      formData.append(key, value);
    } else if (value === null) {
      formData.append(key, "");
    } else {
      formData.append(key, String(value));
    }
  }

  return {
    data: formData,
    config: { headers: { "Content-Type": "multipart/form-data" } },
  };
}
