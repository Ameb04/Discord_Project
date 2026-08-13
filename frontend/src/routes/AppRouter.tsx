import { LoaderCircle } from "lucide-react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import SearchResultsPage from "../pages/SearchResultsPage";
import SettingsPage from "../pages/SettingsPage";
import HomePage from "../pages/HomePage";
import JoinGroupPage from "../pages/JoinGroupPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { SignupPage } from "../pages/SignupPage";
import ProfilePage from "../pages/ProfilePage";
import ScheduledMessagesPage from "../pages/ScheduledMessagesPage";

function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 text-sm text-muted-foreground shadow-2xl shadow-black/30 backdrop-blur-sm">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
        Loading...
      </div>
    </div>
  );
}

function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />;
}

function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/home" replace />;

  return <Outlet />;
}

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) {
    // Carry the target along so signing in lands where the visitor was
    // headed — otherwise a shared group invite dead-ends at the inbox.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

/**
 * Chrome shared by every signed-in page.
 *
 * The shell is pinned to the viewport (`h-dvh`) and the content region owns the
 * only scrollbar. That gives descendants a *definite* height to resolve against,
 * which is what lets the chat pane size itself with `h-full` and keep its
 * composer on screen instead of scrolling away with the message list.
 */
function AppLayout() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/scheduled" element={<ScheduledMessagesPage />} />
          <Route path="/profile/:phone_number" element={<ProfilePage />} />
          <Route path="/chats/:chatId" element={<HomePage />} />
          {/* Signed-in only: joining needs an account, and the redirect back
              to /login preserves nothing, so the link is shown after auth. */}
          <Route path="/join/:token" element={<JoinGroupPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
