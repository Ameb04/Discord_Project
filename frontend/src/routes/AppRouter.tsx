import { Link, NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SearchResultsPage from "../pages/SearchResultsPage";
import SettingsPage from "../pages/SettingsPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { SignupPage } from "../pages/SignupPage";
import ProfilePage from "../pages/ProfilePage";

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#090909] text-white">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-white/70">
        Loading...
      </div>
    </div>
  );
}

function RootRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/search" replace /> : <LandingPage />;
}

function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/search" replace />;

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
    <div className="min-h-screen bg-[#090909] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link className="text-lg font-semibold tracking-tight text-white" to="/search">
          Discord Project
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm">
          <NavLink
            to="/search"
            className={({ isActive }) =>
              isActive ? "text-white" : "text-white/60 transition hover:text-white"
            }
          >
            Search
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              isActive ? "text-white" : "text-white/60 transition hover:text-white"
            }
          >
            Settings
          </NavLink>
        </nav>
      </header>

      <Outlet />
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
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile/:phone_number" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}