import {
  ExternalLink,
  MessageSquarePlus,
  Phone,
  Quote,
  Tag as TagIcon,
  UserRound,
  VenusAndMars,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { startDirectChat } from "@/api/chats";
import { getUserProfile } from "@/api/users";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/apiError";
import { initialsFor, personDisplayName } from "@/lib/format";
import type { PublicUser } from "@/types/user";

type UserProfileDialogProps = {
  open: boolean;
  phoneNumber: string;
  onClose: () => void;
};

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
    <div className="flex items-start gap-3 rounded-xl border border-border bg-white/[0.02] px-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="mt-0.5 text-sm break-words text-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Someone's public profile, without leaving the conversation.
 *
 * Fetched on open rather than reusing the sender embedded in a message: that
 * copy is a snapshot from when the message was sent, and a bio or tag changed
 * since would be shown stale.
 */
function UserProfileDialog({ open, phoneNumber, onClose }: UserProfileDialogProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isStartingChat, setIsStartingChat] = useState(false);

  const isSelf = currentUser?.phone_number === phoneNumber;

  useEffect(() => {
    if (!open) return;

    let isCurrent = true;

    async function loadProfile() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getUserProfile(phoneNumber);
        if (isCurrent) setProfile(data);
      } catch (err) {
        if (!isCurrent) return;
        setProfile(null);
        setError(apiErrorMessage(err, "Unable to load this profile."));
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      isCurrent = false;
    };
  }, [open, phoneNumber]);

  async function handleMessage() {
    setIsStartingChat(true);
    setError("");

    try {
      const chat = await startDirectChat(phoneNumber);
      onClose();
      navigate(`/chats/${chat.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not open a chat with this person."));
    } finally {
      setIsStartingChat(false);
    }
  }

  const displayName = profile
    ? personDisplayName(profile, "Unnamed user")
    : "Profile";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={displayName}
      description={profile ? profile.phone_number : undefined}
      icon={<UserRound className="size-4.5" aria-hidden="true" />}
      className="sm:max-w-md"
      footer={
        profile ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link to={`/profile/${encodeURIComponent(profile.phone_number)}`}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Full profile
              </Link>
            </Button>
            {!isSelf ? (
              <Button
                type="button"
                disabled={isStartingChat}
                onClick={() => void handleMessage()}
              >
                <MessageSquarePlus className="size-4" aria-hidden="true" />
                {isStartingChat ? "Opening..." : "Message"}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : error || !profile ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
        >
          {error || "User not found."}
        </p>
      ) : (
        <AnimatedContent direction="up" distance={10} className="grid gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-16 shrink-0 border border-border">
              {profile.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary/15 text-lg font-semibold text-foreground">
                {initialsFor(displayName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 truncate font-semibold text-foreground">
                  {displayName}
                </p>
                {isSelf ? <Badge variant="secondary">You</Badge> : null}
              </div>
              {profile.bio?.trim() ? (
                <p className="mt-1 text-sm leading-6 break-words text-muted-foreground">
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2">
            <DetailRow icon={<Phone className="size-4" />} label="Phone">
              {profile.phone_number}
            </DetailRow>

            <DetailRow icon={<VenusAndMars className="size-4" />} label="Gender">
              <span className="capitalize">{profile.gender || "Not specified"}</span>
            </DetailRow>

            <DetailRow icon={<Quote className="size-4" />} label="Bio">
              {profile.bio?.trim() || (
                <span className="text-muted-foreground">No bio yet.</span>
              )}
            </DetailRow>

            <DetailRow icon={<TagIcon className="size-4" />} label="Tag">
              {profile.tag ? (
                <Badge variant="secondary">{profile.tag.title}</Badge>
              ) : (
                <span className="text-muted-foreground">No tag.</span>
              )}
            </DetailRow>
          </div>
        </AnimatedContent>
      )}
    </Dialog>
  );
}

export { UserProfileDialog };
