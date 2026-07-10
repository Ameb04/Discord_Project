import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthCard } from "../components/auth/AuthCard";
import { CountryPhoneField } from "../components/auth/CountryPhoneField";
import { GenderSelect } from "../components/auth/GenderSelect";
import { TextField } from "../components/auth/TextField";

function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first_name = parts[0] ?? "";
  const last_name = parts.slice(1).join(" ");
  return { first_name, last_name };
}

export function SignupPage() {
  const navigate = useNavigate();
  const { register, error, clearError } = useAuth();

  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("+98");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setLocalError(null);

    if (!fullName.trim() || !phoneNumber.trim() || !password.trim()) {
      setLocalError("Please fill in fullname, phone number and password.");
      return;
    }

    setSubmitting(true);
    const { first_name, last_name } = splitFullName(fullName);
    const user = await register({
      first_name,
      last_name,
      phone_number: `${countryCode}${phoneNumber.trim()}`,
      gender,
      password,
    });
    setSubmitting(false);

    if (user) {
      navigate("/search", { replace: true });
    }
  };

  return (
    <AuthShell
      visualTitle="Create your account."
      visualText="Sign up with a clean, minimal form that matches the same silver-and-black style."
      visualBullets={[
        "Simple form with only the essentials",
        "Phone number first, then password",
        "A calm layout that is easy to read",
      ]}
    >
      <AuthCard title="Sign up" description="Create your account in a few steps.">
        <form onSubmit={submit} className="grid gap-5">
          <TextField
            label="Full name"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />

          <CountryPhoneField
            label="Phone number"
            countryCode={countryCode}
            phoneNumber={phoneNumber}
            onCountryCodeChange={setCountryCode}
            onPhoneNumberChange={setPhoneNumber}
            helperText="Choose your country code, then type the rest of the phone number."
          />

          <GenderSelect label="Gender" value={gender} onChange={setGender} />

          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
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
            {submitting ? "Signing up..." : "Sign up"}
          </button>
        </form>

        <div className="pt-1 text-sm text-white/55">
          already have account?{" "}
          <Link to="/login" className="font-semibold text-white underline decoration-white/30 underline-offset-4">
            Login
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}