import { AlertCircle, ArrowLeft, Phone, UserRound, VenusAndMars } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { getUserProfile } from "../api/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicUser } from "../types/user";

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

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

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link to="/search">
          <ArrowLeft className="size-4" />
          Back to search
        </Link>
      </Button>
      {children}
    </main>
  );

  if (loading) {
    return shell(
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (error || !user) {
    return shell(
      <div
        role="alert"
        className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
      >
        <AlertCircle className="size-4 shrink-0" />
        {error || "User not found."}
      </div>
    );
  }

  const fullName = `${user.first_name} ${user.last_name}`.trim() || "Unnamed user";
  const initials =
    [user.first_name, user.last_name]
      .map((name) => name.trim().charAt(0))
      .join("")
      .toUpperCase() || "?";
  const genderIcon = <VenusAndMars className="size-4" />;

  return shell(
    <Card className="overflow-hidden pt-0">
      <div className="bg-brand-gradient h-24 opacity-90" aria-hidden="true" />
      <CardHeader className="-mt-12 flex flex-row items-end gap-4">
        <Avatar className="size-24 border-4 border-card shadow-xl shadow-black/40">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={fullName} /> : null}
          <AvatarFallback className="bg-secondary text-2xl font-semibold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 pb-1">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {fullName}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{user.phone_number}</p>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        <DetailRow icon={<Phone className="size-4" />} label="Phone">
          {user.phone_number}
        </DetailRow>

        <DetailRow icon={genderIcon} label="Gender">
          <span className="capitalize">{user.gender || "Not specified"}</span>
        </DetailRow>

        {user.tag ? (
          <DetailRow icon={<UserRound className="size-4" />} label="Tag">
            <Badge variant="secondary">{user.tag.title}</Badge>
          </DetailRow>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default ProfilePage;
