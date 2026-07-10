import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { login as loginRequest, register as registerRequest } from "../api/auth";
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
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function extractErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { data?: { detail?: string; message?: string } };
      message?: string;
    };

    const detail = maybeAxiosError.response?.data?.detail;
    const message = maybeAxiosError.response?.data?.message;
    if (detail) return detail;
    if (message) return message;
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
    await refreshMe();
  }

  void loadUser();
}, [refreshMe]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await loginRequest(payload);
        const nextUser = response.user ?? (await fetchMeWithoutLoading());
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
    [fetchMeWithoutLoading]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await registerRequest(payload);
        const nextUser = response.user ?? (await fetchMeWithoutLoading());
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
    [fetchMeWithoutLoading]
  );

  const logout = useCallback(() => {
    setUser(null);
    setError(null);
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