import type { User } from '../types/user'

type UserCardProps = {
  user: User
}

function UserCard({ user }: UserCardProps) {
  const name = user.display_name || user.username
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <li className="user-card">
      <div className="user-avatar" aria-hidden="true">
        {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initial}
      </div>
      <div className="user-card-body">
        <strong>{name}</strong>
        <span>@{user.username}</span>
      </div>
    </li>
  )
}

export default UserCard
