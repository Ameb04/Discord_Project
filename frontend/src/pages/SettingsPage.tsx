import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  LogOut,
  Lock,
  Phone,
  Save,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { logout as logoutRequest, changePassword } from "../api/auth";
import { getMe, getTags, updateMe, updateMeWithAvatar } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Gender, Tag, User } from "../types/user";

const NO_TAG = "none";

function extractPasswordError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxiosError = error as {
      response?: { data?: Record<string, unknown> };
      message?: string;
    };

    const data = maybeAxiosError.response?.data;
    if (typeof data === "object" && data !== null) {
      const detail = data.detail;
      if (typeof detail === "string") return detail;

      const currentPasswordError = data.current_password;
      if (Array.isArray(currentPasswordError) && typeof currentPasswordError[0] === "string") {
        return currentPasswordError[0];
      }

      const newPasswordError = data.new_password;
      if (Array.isArray(newPasswordError) && typeof newPasswordError[0] === "string") {
        return newPasswordError[0];
      }

      const firstFieldError = Object.values(data).find(
        (value) => Array.isArray(value) && value.length > 0
      );
      if (Array.isArray(firstFieldError) && typeof firstFieldError[0] === "string") {
        return firstFieldError[0];
      }
    }

    if (maybeAxiosError.message) return maybeAxiosError.message;
  }

  return "Could not update your password. Please try again.";
}

function SettingsPage() {
  const navigate = useNavigate();
  const { logout: clearSession, refreshMe } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [canBeAdded, setCanBeAdded] = useState(true);
  const [selectedTagId, setSelectedTagId] = useState<number | "">("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const [profile, availableTags] = await Promise.all([getMe(), getTags()]);
        setUser(profile);
        setTags(availableTags);
        setFirstName(profile.first_name ?? "");
        setLastName(profile.last_name ?? "");
        setGender(profile.gender ?? "male");
        setCanBeAdded(profile.can_be_added_to_group ?? true);
        setSelectedTagId(
          typeof profile.tag === "object" && profile.tag
            ? profile.tag.id
            : typeof profile.tag === "number"
              ? profile.tag
              : ""
        );
        setAvatarPreview(profile.avatar_url ?? null);
      } catch {
        setError("Unable to load your profile.");
      }
    }

    void loadProfile();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setError("");
    setSavedMessage("");

    try {
      const tagValue = selectedTagId === "" ? null : selectedTagId;
      let updated: User;

      if (avatarFile) {
        const formData = new FormData();
        formData.append("first_name", firstName);
        formData.append("last_name", lastName);
        formData.append("gender", gender);
        formData.append("can_be_added_to_group", String(canBeAdded));
        formData.append("tag", tagValue === null ? "" : String(tagValue));
        formData.append("avatar", avatarFile);
        updated = await updateMeWithAvatar(formData);
      } else {
        updated = await updateMe({
          first_name: firstName,
          last_name: lastName,
          gender,
          can_be_added_to_group: canBeAdded,
          tag: tagValue,
        });
      }

      setUser(updated);
      setAvatarPreview(updated.avatar_url ?? null);
      setAvatarFile(null);
      setSavedMessage("Your changes were saved.");
      await refreshMe();
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      setPasswordMessage("");
      setError("Enter both your current and new password.");
      return;
    }

    setIsChangingPassword(true);
    setError("");
    setPasswordMessage("");

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (err) {
      setError(extractPasswordError(err));
    } finally {
      setIsChangingPassword(false);
    }
  }

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

  function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  const initials =
    [firstName, lastName]
      .map((name) => name.trim().charAt(0))
      .join("")
      .toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Edit your profile, update your password, and manage your session."
      />

      <div className="mt-8 grid gap-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar className="size-20 border border-border">
                {avatarPreview ? <AvatarImage src={avatarPreview} alt="Avatar preview" /> : null}
                <AvatarFallback className="bg-primary/15 text-xl font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatar}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  Change avatar
                </Button>
                <p className="text-xs text-muted-foreground">PNG or JPG, up to a few MB.</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone-number">Phone number</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone-number"
                  value={user.phone_number ?? ""}
                  readOnly
                  disabled
                  aria-describedby="phone-number-hint"
                  className="pl-10"
                />
              </div>
              <p id="phone-number-hint" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden="true" />
                Your phone number is your identity here and can&apos;t be changed.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={(value) => setGender(value as Gender)}>
                  <SelectTrigger id="gender" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tag">Tag</Label>
                <Select
                  value={selectedTagId === "" ? NO_TAG : String(selectedTagId)}
                  onValueChange={(value) =>
                    setSelectedTagId(value === NO_TAG ? "" : Number(value))
                  }
                >
                  <SelectTrigger id="tag" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TAG}>No tag</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={String(tag.id)}>
                        {tag.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm text-foreground/80">
              <Checkbox
                checked={canBeAdded}
                onCheckedChange={(checked) => setCanBeAdded(checked === true)}
              />
              Allow adding me to groups
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="button" disabled={isSaving} onClick={handleSave}>
                <Save className="size-4" />
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              {savedMessage ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  {savedMessage}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4 text-primary" />
              Password
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={isChangingPassword || !currentPassword || !newPassword}
                onClick={handleChangePassword}
              >
                {isChangingPassword ? "Updating..." : "Change password"}
              </Button>
              {passwordMessage ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  {passwordMessage}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-destructive/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <h2 className="font-semibold text-foreground">Log out</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Close this session and return to the login page.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              <LogOut className="size-4" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
          >
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default SettingsPage;
