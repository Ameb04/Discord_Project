import { Link } from "react-router-dom";
import type { PublicUser } from "../types/user";

type UserCardProps = {
  user: PublicUser;
};

function UserCard({ user }: UserCardProps) {
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const displayName = fullName || "Unnamed user";
  const initials =
    [user.first_name, user.last_name]
      .map((name) => name.trim().charAt(0))
      .join("")
      .toUpperCase() || "?";

  return (
    <li>
      <Link
        to={`/profile/${encodeURIComponent(user.phone_number)}`}
        className="group flex min-h-24 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg shadow-black/20 transition hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        aria-label={`View ${displayName}'s profile`}
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{displayName}</p>
          <p className="mt-1 truncate text-sm text-white/50">{user.phone_number}</p>
        </div>

        <span className="shrink-0 text-sm font-medium text-white/45 transition group-hover:text-white/75">
          View profile
        </span>
      </Link>
    </li>
  );
}

export default UserCard;
