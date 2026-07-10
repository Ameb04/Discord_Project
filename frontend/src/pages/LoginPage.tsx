import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthCard } from "../components/auth/AuthCard";
import { CountryPhoneField } from "../components/auth/CountryPhoneField";
import { TextField } from "../components/auth/TextField";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuth();

  const [countryCode, setCountryCode] = useState("+98");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setLocalError(null);

    if (!phoneNumber.trim() || !password.trim()) {
      setLocalError("Please fill in phone number and password.");
      return;
    }

    setSubmitting(true);
    const user = await login({
      phone_number: `${countryCode}${phoneNumber.trim()}`,
      password,
    });
    setSubmitting(false);

    if (user) {
      navigate("/search", { replace: true });
    }
  };

  return (
    <AuthShell
      visualTitle="Welcome back."
      visualText="Log in with your phone number and continue in a clean, minimal interface."
      visualBullets={[
        "Black and silver layout with a quiet look",
        "Fast sign-in flow for mobile-first accounts",
        "Everything stays simple and focused",
      ]}
    >
      <AuthCard title="Login" description="Enter your phone number and password to continue.">
        <form onSubmit={submit} className="grid gap-5">
          <CountryPhoneField
            label="Phone number"
            countryCode={countryCode}
            phoneNumber={phoneNumber}
            onCountryCodeChange={setCountryCode}
            onPhoneNumberChange={setPhoneNumber}
            helperText="Choose your country code, then type the rest of the phone number."
          />

          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {(localError || error) ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
              {localError || error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="pt-1 text-sm text-white/55">
          Dont have account?{" "}
          <Link to="/signup" className="font-semibold text-white underline decoration-white/30 underline-offset-4">
            Sign up
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}