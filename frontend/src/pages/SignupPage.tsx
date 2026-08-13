import { useState, type FormEvent } from "react";
import { KeyRound, UserRound, UserRoundPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthCard } from "../components/auth/AuthCard";
import { CountryPhoneField } from "../components/auth/CountryPhoneField";
import { GenderSelect } from "../components/auth/GenderSelect";
import { TextField } from "../components/auth/TextField";
import { FormError } from "../components/auth/FormError";
import { BioField } from "@/components/ui/bio-field";
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
  const [bio, setBio] = useState("");
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
      bio: bio.trim(),
    });
    setSubmitting(false);

    if (user) {
      navigate("/home", { replace: true });
    }
  };

  return (
    <AuthShell
      visualTitle="Join the conversation in seconds."
      visualText="Create your account and start messaging people directly - no clutter, just chat."
      visualBullets={[
        "Only the essentials - set up in under a minute",
        "Your profile, avatar, and tags in one place",
        "Private, direct conversations from day one",
      ]}
    >
      <AuthCard title="Create your account" description="Just a few details and you're in.">
        {/* Six stacked fields do not fit a laptop viewport, and this page is
            meant to be read without scrolling — so the two single-line fields
            share a row and the vertical rhythm is one step tighter than the
            login form's. */}
        <form onSubmit={submit} className="grid gap-3.5">
          <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <TextField
              label="Full name"
              placeholder="Enter your full name"
              icon={<UserRound className="size-4" />}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />

            <GenderSelect label="Gender" value={gender} onChange={setGender} />
          </div>

          <CountryPhoneField
            label="Phone number"
            countryCode={countryCode}
            phoneNumber={phoneNumber}
            onCountryCodeChange={setCountryCode}
            onPhoneNumberChange={setPhoneNumber}
          />

          <BioField
            value={bio}
            onChange={setBio}
            disabled={submitting}
            label="Bio (optional)"
            placeholder="A short line about yourself"
          />

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

          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            <UserRoundPlus className="size-4" aria-hidden="true" />
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline underline-offset-4">
            Login
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}