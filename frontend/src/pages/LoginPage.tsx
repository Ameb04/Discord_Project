import { useState, type FormEvent } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthCard } from "../components/auth/AuthCard";
import { CountryPhoneField } from "../components/auth/CountryPhoneField";
import { TextField } from "../components/auth/TextField";
import { FormError } from "../components/auth/FormError";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, error, clearError } = useAuth();

  // Where the guard bounced the visitor from, so a shared link — a group
  // invite, say — still lands on its target after signing in. Only in-app
  // paths are honoured, so the state cannot be used as an open redirect.
  const redirectState = location.state as { from?: string } | null;
  const redirectTo =
    typeof redirectState?.from === "string" &&
    redirectState.from.startsWith("/") &&
    !redirectState.from.startsWith("//")
      ? redirectState.from
      : "/home";

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
      navigate(redirectTo, { replace: true });
    }
  };

  return (
    <AuthShell
      visualTitle="Pick up right where you left off."
      visualText="Sign in to keep the conversation going - fast, secure, and beautifully minimal."
      visualBullets={[
        "Instant, real-time direct messaging",
        "Share files and media in a tap",
        "A calm, focused, distraction-free space",
      ]}
    >
      <AuthCard title="Welcome back" description="Enter your phone number and password to continue.">
        <form onSubmit={submit} className="grid gap-4">
          <CountryPhoneField
            label="Phone number"
            countryCode={countryCode}
            phoneNumber={phoneNumber}
            onCountryCodeChange={setCountryCode}
            onPhoneNumberChange={setPhoneNumber}
          />

          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            icon={<KeyRound className="size-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <FormError message={localError || error} />

          <Button type="submit" size="lg" disabled={submitting} className="mt-1 w-full">
            <LogIn className="size-4" aria-hidden="true" />
            {submitting ? "Logging in..." : "Login"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}