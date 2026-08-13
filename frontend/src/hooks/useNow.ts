import { useEffect, useState } from "react";

/**
 * A `Date` that re-renders the caller on a fixed cadence.
 *
 * Used wherever the UI states a countdown ("in 3 hours") or gates on "is this
 * still in the future" — both go stale on their own while a panel sits open.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
