import { useCallback, useEffect, useState } from "react";

/**
 * Copy text, and report success for a moment.
 *
 * The confirmation is the whole point: a clipboard write is otherwise
 * completely invisible, so a button that does nothing visible reads as broken.
 * A denied clipboard leaves the flag false and the link on screen to select by
 * hand, which is the honest fallback.
 */
function useCopyFeedback(resetAfterMs = 2000) {
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!hasCopied) return;
    const timer = setTimeout(() => setHasCopied(false), resetAfterMs);
    return () => clearTimeout(timer);
  }, [hasCopied, resetAfterMs]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHasCopied(true);
    } catch {
      // Clipboard access can be denied; the text stays selectable on screen.
    }
  }, []);

  return { hasCopied, copy };
}

export { useCopyFeedback };
