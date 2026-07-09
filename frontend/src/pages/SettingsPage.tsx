import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout as logoutRequest } from "../api/auth";
import { useAuth } from "../context/AuthContext";

function SettingsPage() {
  const navigate = useNavigate();
  const { logout: clearSession } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setIsLoggingOut(true);
    setError("");

    try {
      await logoutRequest();
      clearSession();
      navigate("/login", { replace: true });
    } catch {
      setError("Logout is unavailable right now. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="max-w-2xl">
        <p className="text-xs uppercase text-white/45">Account</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Settings
        </h1>
        <p className="mt-3 text-sm leading-7 text-white/60">
          Manage your current session.
        </p>
      </div>

      <section className="mt-8 flex items-center justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">
        <div>
          <h2 className="font-semibold text-white">Log out</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Close this session and return to the login page.
          </p>
        </div>

        <button
          type="button"
          disabled={isLoggingOut}
          onClick={handleLogout}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/[0.08] px-5 text-sm font-semibold text-red-100 transition hover:border-red-400/30 hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? "Logging out..." : "Log out"}
        </button>
      </section>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-100/80"
        >
          {error}
        </div>
      )}
    </main>
  );
}

export default SettingsPage;
