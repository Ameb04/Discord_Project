import { ArrowRight, Globe, Hash, LoaderCircle, LogIn, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { joinChannel } from "@/api/channels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/apiError";
import { initialsFor } from "@/lib/format";
import type { ChannelConversation } from "@/types/chat";

type ChannelCardProps = {
  channel: ChannelConversation;
  /** Called after a successful join, so the list can reflect the new standing. */
  onJoined?: () => void;
};

/**
 * One public channel in the directory.
 *
 * Joining happens right here rather than one page deeper: the card already
 * shows everything the decision needs — what it is, how big it is, how many
 * topics — and a browse-then-commit flow that costs a page load for every
 * candidate is a worse way to find your first channel.
 */
function ChannelCard({ channel, onJoined }: ChannelCardProps) {
  const navigate = useNavigate();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    setIsJoining(true);
    setError("");

    try {
      await joinChannel(channel.id);
      onJoined?.();
      navigate(`/channels/${channel.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not join this channel."));
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-4 shadow-lg shadow-black/20 backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-card/80">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
        <Link
          to={`/channels/${channel.id}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:gap-4"
          aria-label={`Open the ${channel.name} channel`}
        >
          <Avatar className="size-12 shrink-0 border border-border">
            {channel.avatar_url ? (
              <AvatarImage src={channel.avatar_url} alt={channel.name} />
            ) : null}
            <AvatarFallback className="bg-brand-gradient font-semibold text-white">
              {initialsFor(channel.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground group-hover:text-primary">
              {channel.name}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {channel.bio.trim() || "No description."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1">
                <Globe className="size-3" aria-hidden="true" />
                Public
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Users className="size-3" aria-hidden="true" />
                {channel.member_count}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Hash className="size-3" aria-hidden="true" />
                {channel.topic_count}
              </Badge>
              {channel.tag ? (
                <Badge variant="secondary">{channel.tag.title}</Badge>
              ) : null}
            </div>
          </div>
        </Link>

        {channel.is_member ? (
          <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
            <Link to={`/channels/${channel.id}`}>
              Open
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={isJoining}
            onClick={() => void handleJoin()}
          >
            {isJoining ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Joining...
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden="true" />
                Join
              </>
            )}
          </Button>
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

export default ChannelCard;
