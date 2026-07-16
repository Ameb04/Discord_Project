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
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/20 transition hover:border-white/20 hover:bg-white/[0.07]">
        <div className="flex min-h-16 items-center gap-4">
          <Link
            to={`/profile/${encodeURIComponent(user.phone_number)}`}
            className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            aria-label={`View ${displayName}'s profile`}
          >
            <Avatar className="size-12 shrink-0">
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={displayName} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{displayName}</p>
              <p className="mt-1 truncate text-sm text-white/50">{user.phone_number}</p>
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
              variant="secondary"
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
