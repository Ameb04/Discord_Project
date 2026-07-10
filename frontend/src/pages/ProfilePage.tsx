import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { getUserProfile } from "../api/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicUser } from "../types/user";

function ProfilePage() {
  const { phone_number } = useParams<{ phone_number: string }>();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!phone_number) {
        setError("Invalid user.");
        setLoading(false);
        return;
      }

      try {
        const data = await getUserProfile(phone_number);
        setUser(data);
      } catch {
        setError("Unable to load profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [phone_number]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
        <p className="text-sm text-white/60">Loading profile...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
        <div
          role="alert"
          className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-100/80"
        >
          {error}
        </div>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/search">Back to search</Link>
        </Button>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
        <p className="text-sm text-white/60">User not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/search">Back to search</Link>
        </Button>
      </main>
    );
  }

  const fullName = `${user.first_name} ${user.last_name}`.trim() || "Unnamed user";
  const initials =
    [user.first_name, user.last_name]
      .map((name) => name.trim().charAt(0))
      .join("")
      .toUpperCase() || "?";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs uppercase text-white/45">Profile</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{fullName}</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">
          Public profile details for this user.
        </p>
      </div>

      <Card className="max-w-xl border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-16">
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={fullName} /> : null}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate text-xl text-white">{fullName}</CardTitle>
            <p className="mt-1 truncate text-sm text-white/50">{user.phone_number}</p>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-white/40">Phone</p>
            <p className="mt-1 text-sm text-white">{user.phone_number}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-white/40">Gender</p>
            <div className="mt-2">
              <Badge variant="secondary" className="capitalize">
                {user.gender || "Not specified"}
              </Badge>
            </div>
          </div>

          {user.tag ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-white/40">Tag</p>
              <div className="mt-2">
                <Badge variant="secondary">{user.tag.title}</Badge>
              </div>
            </div>
          ) : null}

          <Button asChild variant="outline" className="w-fit">
            <Link to="/search">Back to search</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default ProfilePage;
