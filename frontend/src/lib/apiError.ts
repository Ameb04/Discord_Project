/** Reading errors off DRF responses without scattering `any` through the app. */

type ApiErrorShape = {
  response?: { status?: number; data?: unknown };
  message?: string;
};

function asApiError(error: unknown): ApiErrorShape | null {
  if (typeof error !== "object" || error === null) return null;
  return error as ApiErrorShape;
}

export function apiStatus(error: unknown): number | undefined {
  return asApiError(error)?.response?.status;
}

/**
 * The most specific human-readable message an error carries.
 *
 * DRF answers in three shapes — `{detail}` for permission and auth failures,
 * `{field: [messages]}` for validation, and a bare string list for non-field
 * errors — so all three are unwrapped before falling back.
 *
 * `preferredFields` come first when given, so a form can surface the error for
 * the field the user is actually looking at rather than whichever key the
 * serializer happened to emit first.
 */
export function apiErrorMessage(
  error: unknown,
  fallback: string,
  preferredFields: string[] = []
): string {
  const apiError = asApiError(error);
  if (!apiError) return fallback;

  const data = apiError.response?.data;

  if (typeof data === "string" && data.trim()) return data;

  if (Array.isArray(data) && typeof data[0] === "string") return data[0];

  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;

    if (typeof record.detail === "string") return record.detail;

    const orderedKeys = [
      ...preferredFields.filter((field) => field in record),
      ...Object.keys(record).filter((key) => !preferredFields.includes(key)),
    ];

    for (const key of orderedKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }

  if (apiError.message) return apiError.message;
  return fallback;
}
