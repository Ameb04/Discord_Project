import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { startDirectChat } from "../api/chats";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialsFor, personDisplayName } from "@/lib/format";
import { useAuth } from "../context/AuthContext";
import type { PublicUser } from "../types/user";

type UserCardProps = {
  user: PublicUser;
};

/**
 * One search result. Renders a bare card — the caller owns the `<li>`, so the
 * list can wrap each row in a motion element without nesting list items.
 */
function UserCard({ user }: UserCardProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [error, setError] = useState("");

  const displayName = personDisplayName(user, "Unnamed user");
  const isSelf = currentUser?.phone_number === user.phone_number;

  async function handleStartChat() {
    if (isSelf || isStartingChat) return;

    setIsStartingChat(true);
    setError("");

    try {
      const chat = await startDirectChat(user.phone_number);
      navigate(`/chats/${chat.id}`);
    } catch {
      setError("Could not start this chat. Please try again.");
    } finally {
      setIsStartingChat(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-4 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/80">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
        <Link
          to={`/profile/${encodeURIComponent(user.phone_number)}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:gap-4"
          aria-label={`View ${displayName}'s profile`}
        >
          <Avatar className="size-12 shrink-0 border border-border">
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary/15 font-semibold text-foreground">
              {initialsFor(displayName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground group-hover:text-primary">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {user.phone_number}
            </p>
            {user.tag ? (
              <Badge variant="secondary" className="mt-2">
                {user.tag.title}
              </Badge>
            ) : null}
          </div>
        </Link>

        {!isSelf ? (
          <Button
            type="button"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={isStartingChat}
            onClick={handleStartChat}
          >
            <MessageSquarePlus className="size-4" aria-hidden="true" />
            {isStartingChat ? "Opening..." : "Message"}
          </Button>
        ) : (
          <Badge variant="secondary" className="shrink-0">
            You
          </Badge>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-100/80">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default UserCard;
