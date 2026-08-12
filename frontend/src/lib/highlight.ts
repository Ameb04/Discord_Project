/** Splitting text on a search term, for marking matches in place. */

export type TextSegment = {
  text: string;
  isMatch: boolean;
};

/**
 * Split `text` into alternating plain and matching segments.
 *
 * One literal substring, case-insensitive — the same thing the server's
 * `content__icontains` matched on, so what gets marked here is exactly what
 * put the message in the result list. Matching segments keep the casing of
 * the original text rather than the casing of the query.
 */
export function splitOnQuery(
  text: string,
  query: string | null | undefined
): TextSegment[] {
  const needle = query?.trim();
  if (!needle) return [{ text, isMatch: false }];

  const foldedText = text.toLowerCase();
  const foldedNeedle = needle.toLowerCase();

  // Case folding is not always length-preserving — Turkish dotted capital I
  // folds to two code points — and an offset into the folded copy would then
  // slice the original in the wrong place. Better no marks than mangled text.
  if (
    foldedText.length !== text.length ||
    foldedNeedle.length !== needle.length
  ) {
    return [{ text, isMatch: false }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (;;) {
    const index = foldedText.indexOf(foldedNeedle, cursor);
    if (index === -1) break;
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), isMatch: false });
    }
    segments.push({
      text: text.slice(index, index + needle.length),
      isMatch: true,
    });
    cursor = index + needle.length;
  }

  if (segments.length === 0) return [{ text, isMatch: false }];
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }
  return segments;
}
