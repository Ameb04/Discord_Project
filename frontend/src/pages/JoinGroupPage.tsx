import { LoaderCircle, LogIn, Users, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getGroupInvite, joinGroup } from "../api/groups";
import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage, apiStatus } from "@/lib/apiError";
import { initialsFor } from "@/lib/format";
import type { GroupInvitePreview } from "../types/chat";

/**
 * The landing page for a group invite link.
 *
 * Joining is a POST rather than a side effect of the GET: opening a link — from
 * a preview crawler, a prefetch, or a stray refresh — should show what the group
 * is, not silently enrol the visitor. The button is the consent.
 */
function JoinGroupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<GroupInvitePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadInvite() {
      if (!token) {
        setIsLoading(false);
        setError("This invite link is not valid.");
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const preview = await getGroupInvite(token);
        if (isCurrent) setInvite(preview);
      } catch (err) {
        if (!isCurrent) return;
        setInvite(null);
        setError(
          apiStatus(err) === 404
            ? "This invite link has expired or the group no longer exists."
            : apiErrorMessage(err, "Could not open this invite link.")
        );
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadInvite();

    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function handleJoin() {
    if (!token) return;

    setIsJoining(true);
    setJoinError("");

    try {
      const group = await joinGroup(token);
      navigate(`/chats/${group.id}`, { replace: true });
    } catch (err) {
      setJoinError(
        apiErrorMessage(err, "Could not join this group.", ["token"])
      );
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl place-items-center px-4 py-10 sm:px-6">
      <AnimatedContent
        direction="up"
        scale
        className="w-full rounded-2xl border border-border bg-card/50 p-6 text-center shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-8"
      >
        {isLoading ? (
          <div className="grid justify-items-center gap-3">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : error ? (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-3xl bg-destructive/10 text-red-200">
              <UsersRound className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Invite unavailable
            </h1>
            <p role="alert" className="mt-3 text-sm leading-7 text-muted-foreground">
              {error}
            </p>
            <Button asChild className="mt-6">
              <Link to="/home">Back to inbox</Link>
            </Button>
          </>
        ) : invite ? (
          <>
            <Avatar className="mx-auto size-20 border border-border">
              {invite.avatar_url ? (
                <AvatarImage src={invite.avatar_url} alt={invite.name} />
              ) : null}
              <AvatarFallback className="bg-primary/15 text-lg font-semibold text-foreground">
                {initialsFor(invite.name)}
              </AvatarFallback>
            </Avatar>

            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {invite.name}
            </h1>

            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-4" aria-hidden="true" />
              {invite.member_count}{" "}
              {invite.member_count === 1 ? "member" : "members"}
            </p>

            {invite.bio.trim() ? (
              <p className="mt-4 text-sm leading-7 break-words whitespace-pre-wrap text-muted-foreground">
                {invite.bio}
              </p>
            ) : null}

            {joinError ? (
              <p
                role="alert"
                className="mt-5 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-red-100"
              >
                {joinError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {invite.is_member ? (
                <Button asChild>
                  <Link to={`/chats/${invite.id}`}>Open group</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isJoining}
                  onClick={() => void handleJoin()}
                >
                  {isJoining ? (
                    <>
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Joining...
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" aria-hidden="true" />
                      Join group
                    </>
                  )}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/home">Back to inbox</Link>
              </Button>
            </div>
          </>
        ) : null}
      </AnimatedContent>
    </div>
  );
}

export default JoinGroupPage;
