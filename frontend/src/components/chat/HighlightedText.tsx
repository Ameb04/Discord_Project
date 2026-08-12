import { Fragment, useMemo } from "react";

import { splitOnQuery } from "@/lib/highlight";
import { cn } from "@/lib/utils";

type HighlightedTextProps = {
  text: string;
  /** The active search term. Nothing is marked when it is empty. */
  query?: string | null;
  /** Styling for the marked runs; the default reads on both bubble colours. */
  markClassName?: string;
};

/**
 * Message text with the current search term marked in place.
 *
 * A real `<mark>` rather than a styled span: the element already means "marked
 * for reference in another context", which is precisely what a search hit is,
 * and assistive technology announces it as such. The colour is set explicitly
 * because a bare `<mark>` inherits a black-on-yellow default that fights every
 * surface in this app.
 */
function HighlightedText({ text, query, markClassName }: HighlightedTextProps) {
  const segments = useMemo(() => splitOnQuery(text, query), [text, query]);

  if (segments.length === 1 && !segments[0].isMatch) return <>{text}</>;

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={index}
            className={cn(
              "rounded-[0.25rem] bg-amber-300 px-0.5 font-medium text-black",
              markClassName
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}

export { HighlightedText };
