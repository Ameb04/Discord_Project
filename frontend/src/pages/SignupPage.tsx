import { useState, type FormEvent } from "react";
import { KeyRound, Sparkles, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthCard } from "../components/auth/AuthCard";
import { CountryPhoneField } from "../components/auth/CountryPhoneField";
import { GenderSelect } from "../components/auth/GenderSelect";
import { TextField } from "../components/auth/TextField";
import { FormError } from "../components/auth/FormError";
import { Button } from "@/components/ui/button";

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
      navigate("/home", { replace: true });
    }
  };

  return (
    <AuthShell
      visualTitle="Join the conversation in seconds."
      visualText="Create your account and start messaging people directly — no clutter, just chat."
      visualBullets={[
        "Only the essentials — set up in under a minute",
        "Your profile, avatar, and tags in one place",
        "Private, direct conversations from day one",
      ]}
    >
      <AuthCard title="Create your account" description="Just a few details and you're in.">
        <form onSubmit={submit} className="grid gap-4">
          <TextField
            label="Full name"
            placeholder="Enter your full name"
            icon={<User className="size-4" />}
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
          />

          <GenderSelect label="Gender" value={gender} onChange={setGender} />

          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            icon={<KeyRound className="size-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <FormError message={localError || error} />

          <Button type="submit" size="lg" disabled={submitting} className="mt-1 w-full">
            <Sparkles className="size-4" aria-hidden="true" />
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline underline-offset-4">
            Login
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}