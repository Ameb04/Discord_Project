import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startDirectChat } from "../api/chats";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import type { PublicUser } from "../types/user";

type UserCardProps = {
  user: PublicUser;
};

function UserCard({ user }: UserCardProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [error, setError] = useState("");
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const displayName = fullName || "Unnamed user";
  const isSelf = currentUser?.phone_number === user.phone_number;
  const initials =
    [user.first_name, user.last_name]
      .map((name) => name.trim().charAt(0))
      .join("")
      .toUpperCase() || "?";

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
    <li>
      <div className="group/card rounded-2xl border border-border bg-card/50 p-4 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/80">
        <div className="flex min-h-16 items-center gap-4">
          <Link
            to={`/profile/${encodeURIComponent(user.phone_number)}`}
            className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            aria-label={`View ${displayName}'s profile`}
          >
            <Avatar className="size-12 shrink-0 border border-border">
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/15 font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground group-hover:text-primary">
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{user.phone_number}</p>
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
              disabled={isStartingChat}
              onClick={handleStartChat}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {isStartingChat ? "Opening..." : "Message"}
            </Button>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-100/80">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default UserCard;
