import { Loader2 } from "lucide-react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import SearchResultsPage from "../pages/SearchResultsPage";
import SettingsPage from "../pages/SettingsPage";
import HomePage from "../pages/HomePage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { SignupPage } from "../pages/SignupPage";
import ProfilePage from "../pages/ProfilePage";

function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 text-sm text-muted-foreground shadow-2xl shadow-black/30 backdrop-blur-sm">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
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

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
}

function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
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
          <Route path="/profile/:phone_number" element={<ProfilePage />} />
          <Route path="/chats/:chatId" element={<HomePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
