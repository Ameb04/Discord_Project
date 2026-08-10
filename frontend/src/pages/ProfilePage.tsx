import {
  ArrowLeft,
  CircleAlert,
  Phone,
  Quote,
  Tag as TagIcon,
  VenusAndMars,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { getUserProfile } from "../api/users";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { initialsFor, personDisplayName } from "@/lib/format";
import type { PublicUser } from "../types/user";

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-3 py-3 sm:px-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="mt-0.5 text-sm break-words text-foreground">{children}</div>
      </div>
    </div>
  );
}

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
        <Link to="/search">
          <ArrowLeft className="size-4" />
          Back to search
        </Link>
      </Button>
      {children}
    </main>
  );
}

function ProfilePage() {
  const { phone_number: phoneNumber } = useParams<{ phone_number: string }>();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadProfile() {
      if (!phoneNumber) {
        setError("Invalid user.");
        setIsLoading(false);
        return;
      }

      try {
        const data = await getUserProfile(phoneNumber);
        if (isCurrent) setUser(data);
      } catch {
        if (isCurrent) setError("Unable to load profile.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      isCurrent = false;
    };
  }, [phoneNumber]);

  if (isLoading) {
    return (
      <ProfileShell>
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col items-center gap-4 sm:flex-row">
            <Skeleton className="size-20 rounded-full" />
            <div className="w-full space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </CardContent>
        </Card>
      </ProfileShell>
    );
  }

  if (error || !user) {
    return (
      <ProfileShell>
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm text-red-100"
        >
          <CircleAlert className="size-4 shrink-0" />
          {error || "User not found."}
        </div>
      </ProfileShell>
    );
  }

  const fullName = personDisplayName(user, "Unnamed user");

  return (
    <ProfileShell>
      <AnimatedContent direction="up" scale>
        <Card className="overflow-hidden pt-0">
          <div className="bg-brand-gradient h-20 opacity-90 sm:h-24" aria-hidden="true" />
          {/* Stacks below `sm`: an avatar plus a long name simply does not fit
              beside a 24-unit circle on a 320px screen. */}
          <CardHeader className="-mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4">
            <Avatar className="size-20 shrink-0 border-4 border-card shadow-xl shadow-black/40 sm:size-24">
              {user.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={fullName} />
              ) : null}
              <AvatarFallback className="bg-secondary text-2xl font-semibold text-foreground">
                {initialsFor(fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 pb-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {fullName}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {user.phone_number}
              </p>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3">
            <DetailRow icon={<Phone className="size-4" />} label="Phone">
              {user.phone_number}
            </DetailRow>

            <DetailRow icon={<VenusAndMars className="size-4" />} label="Gender">
              <span className="capitalize">{user.gender || "Not specified"}</span>
            </DetailRow>

            {user.bio?.trim() ? (
              <DetailRow icon={<Quote className="size-4" />} label="Bio">
                {user.bio}
              </DetailRow>
            ) : null}

            {user.tag ? (
              <DetailRow icon={<TagIcon className="size-4" />} label="Tag">
                <Badge variant="secondary">{user.tag.title}</Badge>
              </DetailRow>
            ) : null}
          </CardContent>
        </Card>
      </AnimatedContent>
    </ProfileShell>
  );
}

export default ProfilePage;
