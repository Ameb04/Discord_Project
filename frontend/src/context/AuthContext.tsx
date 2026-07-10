import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  ensureCsrfCookie,
} from "../api/auth";
import { getMe } from "../api/users";
import type { LoginPayload, RegisterPayload, User } from "../types/user";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<User | null>;
  register: (payload: RegisterPayload) => Promise<User | null>;
  refreshMe: () => Promise<User | null>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function extractErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { data?: Record<string, unknown> };
      message?: string;
    };

    const data = maybeAxiosError.response?.data;
    if (typeof data === "object" && data !== null) {
      const detail = data.detail;
      const message = data.message;
      if (typeof detail === "string") return detail;
      if (typeof message === "string") return message;

      const firstFieldError = Object.values(data).find((value) => Array.isArray(value) && value.length > 0);
      if (Array.isArray(firstFieldError) && typeof firstFieldError[0] === "string") {
        return firstFieldError[0];
      }
    }

    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Something went wrong.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeWithoutLoading = useCallback(async () => {
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      return currentUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const currentUser = await fetchMeWithoutLoading();
    setIsLoading(false);
    return currentUser;
  }, [fetchMeWithoutLoading]);

  useEffect(() => {
    async function loadUser() {
      try {
        await ensureCsrfCookie();
      } catch {
        // CSRF bootstrap is best-effort; writes will retry after a fresh cookie.
      }

      await refreshMe();
    }

    void loadUser();
  }, [refreshMe]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setIsLoading(true);
      setError(null);

      try {
        const nextUser = await loginRequest(payload);
        setUser(nextUser);
        return nextUser;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        setUser(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setIsLoading(true);
      setError(null);

      try {
        const nextUser = await registerRequest(payload);
        setUser(nextUser);
        return nextUser;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        setUser(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setError(null);

    try {
      await logoutRequest();
    } catch {
      // Clear local state even if the server session is already gone.
    }

    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      error,
      isAuthenticated: Boolean(user),
      login,
      register,
      refreshMe,
      logout,
      clearError,
    }),
    [user, isLoading, error, login, register, refreshMe, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}