import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  notificationWebSocketUrl,
  parseMessageNotification,
} from "../api/notificationSocket";
import { useAuth } from "./AuthContext";
import type { ActiveNotification } from "../types/notification";

/** How long a toast stays before it retires on its own. */
const DISMISS_AFTER_MS = 6000;

/**
 * How many toasts stand at once.
 *
 * A burst in a busy group would otherwise paper over the app; the oldest steps
 * aside rather than the newest being dropped, because the most recent message
 * is the one worth reading.
 */
const MAX_VISIBLE = 3;

const MAX_RECONNECT_ATTEMPTS = 6;

type NotificationContextValue = {
  notifications: ActiveNotification[];
  dismiss: (key: string) => void;
  dismissAll: () => void;
  /**
   * Tell the provider which conversation is on screen.
   *
   * The server has no idea what the reader is looking at, so suppressing the
   * notification for the open chat is decided here — the only place that knows.
   */
  setActiveChatId: (chatId: number | null) => void;
  /**
   * Rises whenever anything happened in any of the viewer's conversations —
   * including muted ones, which still change what is unread.
   *
   * Deliberately a bare counter rather than the unread numbers themselves.
   * Keeping a running client-side tally means maintaining a second copy of
   * something the server already computes exactly, and every edge case that
   * copy gets wrong (a deleted message, a chat read in another tab) is a badge
   * that stays wrong until reload. A counter just says "ask again".
   */
  activityEpoch: number;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<ActiveNotification[]>([]);
  const [activityEpoch, setActivityEpoch] = useState(0);

  /**
   * The open conversation, held in a ref rather than state.
   *
   * The socket handler must read the *current* value without being torn down
   * and rebuilt every time the reader opens a different chat — reconnecting on
   * navigation would drop notifications during the gap.
   */
  const activeChatIdRef = useRef<number | null>(null);
  const dismissTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Rising counter so two messages never produce the same React key. */
  const keyCounterRef = useRef(0);

  const setActiveChatId = useCallback((chatId: number | null) => {
    activeChatIdRef.current = chatId;
  }, []);

  const dismiss = useCallback((key: string) => {
    const timer = dismissTimersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(key);
    }
    // A toast pushed off the end of the stack still has its timer running, so
    // this fires for cards that are already gone. Returning the same array
    // lets React skip the render rather than churning the whole stack.
    setNotifications((current) =>
      current.some((item) => item.key === key)
        ? current.filter((item) => item.key !== key)
        : current
    );
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of dismissTimersRef.current.values()) {
      clearTimeout(timer);
    }
    dismissTimersRef.current.clear();
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let disposed = false;

    function scheduleReconnect() {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (disposed) return;

      try {
        socket = new WebSocket(notificationWebSocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (disposed) {
          socket?.close(1000, "Signed out");
          return;
        }
        reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        if (disposed || typeof event.data !== "string") return;

        const notification = parseMessageNotification(event.data);
        if (!notification) return;

        // Something changed somewhere, whoever it was for and whatever the
        // mute state — the unread badges are now stale. This fires for every
        // frame, including the ones that go no further than here.
        setActivityEpoch((epoch) => epoch + 1);

        // A muted conversation counts but never interrupts.
        if (!notification.notify) return;

        // The conversation the reader is already looking at needs no telling.
        // The document being hidden means they are not actually looking, even
        // though the chat is technically open — a background tab still counts
        // as away.
        if (
          notification.chat === activeChatIdRef.current &&
          document.visibilityState === "visible"
        ) {
          return;
        }

        keyCounterRef.current += 1;
        const key = `${notification.messageId}-${keyCounterRef.current}`;
        const entry: ActiveNotification = { ...notification, key };

        setNotifications((current) =>
          [...current, entry].slice(-MAX_VISIBLE)
        );

        dismissTimersRef.current.set(
          key,
          setTimeout(() => dismiss(key), DISMISS_AFTER_MS)
        );
      };

      // No `onerror`: a failed socket closes right after, and `onclose` is the
      // handler that knows whether retrying is worth it.

      socket.onclose = (event) => {
        socket = null;
        if (disposed) return;
        // 4401 is the consumer's "not signed in"; retrying replays it.
        if (event.code === 4401) return;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close(1000, "Signed out");
      }
      // The toasts belong to the session this socket served. Signing out — or
      // signing in as someone else — must not leave the previous account's
      // messages sitting on screen, and this cleanup runs on exactly those.
      dismissAll();
    };
    // Keyed on the account as well as the flag, so switching users opens a
    // fresh socket rather than reusing one bound to the previous session.
  }, [dismiss, dismissAll, isAuthenticated, user?.phone_number]);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, dismiss, dismissAll, setActiveChatId, activityEpoch }),
    [activityEpoch, dismiss, dismissAll, notifications, setActiveChatId]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationProvider");
  }
  return context;
}
