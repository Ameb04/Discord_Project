import { useNavigate } from "react-router-dom";
import type { PublicUser } from "../types/user";

type UserCardProps = {
  user: PublicUser;
};

function UserCard({ user }: UserCardProps) {
  const navigate = useNavigate();

  const name = `${user.first_name} ${user.last_name}`.trim();
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <li
      className="user-card"
      onClick={() => navigate(`/profile/${user.phone_number}`)}
    >
      <div className="user-avatar" aria-hidden="true">
        {initial}
      </div>

      <div className="user-card-body">
        <strong>{name}</strong>
        <span>{user.phone_number}</span>
      </div>
    </li>
  );
}

export default UserCard;