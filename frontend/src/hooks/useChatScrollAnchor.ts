import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Within this many pixels of the end still counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 80;

type ChatScrollAnchorOptions = {
  /** The element that actually scrolls the message history. */
  containerRef: RefObject<HTMLElement | null>;
  /** True while the first page of history is still being fetched. */
  isLoading: boolean;
  /** Id of the last message in the list; a change means the tail moved. */
  newestMessageId: number | null;
  /** Length of the rendered list, so prepends are noticed too. */
  messageCount: number;
};

/**
 * Keeps a conversation anchored where a reader expects it.
 *
 * Three behaviours, in priority order:
 *
 * 1. **Opening a chat lands on the newest message.** A chat is a place you
 *    return to, not a document you read from the top, so the history sits
 *    *above* the viewport waiting to be scrolled back through.
 * 2. **Loading older messages holds your place.** The prepended page would
 *    otherwise shove whatever you were reading down by its own height, so the
 *    distance to the *end* of the list is preserved rather than the distance
 *    from the start.
 * 3. **New messages follow only if you are already at the end.** Yanking
 *    someone out of the history they are reading is worse than making them
 *    press "jump to latest".
 *
 * `useLayoutEffect`, not `useEffect`: the correction has to land in the same
 * frame the new rows paint, or the reader sees the list jump and snap back.
 */
function useChatScrollAnchor({
  containerRef,
  isLoading,
  newestMessageId,
  messageCount,
}: ChatScrollAnchorOptions) {
  const [isAtBottom, setIsAtBottom] = useState(true);

  // The same fact as `isAtBottom`, readable from inside the layout effect
  // without making the effect re-run every time the reader scrolls.
  const isAtBottomRef = useRef(true);
  const hasAnchoredRef = useRef(false);
  const lastNewestIdRef = useRef<number | null>(null);
  /** Distance from the end of the list, captured before a prepend. */
  const olderAnchorRef = useRef<number | null>(null);
  /** Set when the next render is a deliberate jump to a specific message. */
  const focusPendingRef = useRef(false);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const node = containerRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    },
    [containerRef]
  );

  const handleScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    if (atBottom === isAtBottomRef.current) return;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, [containerRef]);

  /** Call immediately before prepending a page of older messages. */
  const captureOlderAnchor = useCallback(() => {
    const node = containerRef.current;
    olderAnchorRef.current = node ? node.scrollHeight - node.scrollTop : null;
  }, [containerRef]);

  /**
   * Call before swapping the list out to focus one message — a search hit,
   * say. The next render is then left alone for the caller to scroll.
   */
  const suspendAutoScroll = useCallback(() => {
    focusPendingRef.current = true;
  }, []);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || isLoading) return;

    if (olderAnchorRef.current !== null) {
      node.scrollTop = node.scrollHeight - olderAnchorRef.current;
      olderAnchorRef.current = null;
      return;
    }

    if (focusPendingRef.current) {
      focusPendingRef.current = false;
      lastNewestIdRef.current = newestMessageId;
      return;
    }

    if (!hasAnchoredRef.current) {
      hasAnchoredRef.current = true;
      lastNewestIdRef.current = newestMessageId;
      scrollToBottom();
      return;
    }

    const tailMoved =
      newestMessageId !== null && newestMessageId !== lastNewestIdRef.current;
    lastNewestIdRef.current = newestMessageId;
    if (tailMoved && isAtBottomRef.current) scrollToBottom("smooth");
  }, [containerRef, isLoading, messageCount, newestMessageId, scrollToBottom]);

  return {
    isAtBottom,
    handleScroll,
    scrollToBottom,
    captureOlderAnchor,
    suspendAutoScroll,
  };
}

export { useChatScrollAnchor };
