import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUserProfile } from "../api/users";
import type { PublicUser } from "../types/user";

function ProfilePage() {
  const { phone_number } = useParams<{ phone_number: string }>();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!phone_number) {
        setError("Invalid user.");
        setLoading(false);
        return;
      }

      try {
        const data = await getUserProfile(phone_number);
        setUser(data);
      } catch {
        setError("Unable to load profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [phone_number]);

  if (loading) {
    return (
      <main className="page-shell">
        <p>Loading profile...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell">
        <p>{error}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-shell">
        <p>User not found.</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="profile-page">
        <div className="user-avatar">
          {user.first_name.charAt(0).toUpperCase()}
        </div>

        <h1>
          {user.first_name} {user.last_name}
        </h1>

        <div className="profile-info">
          <p>
            <strong>Phone:</strong> {user.phone_number}
          </p>

          <p>
            <strong>Gender:</strong> {user.gender}
          </p>
        </div>
      </section>
    </main>
  );
}

export default ProfilePage;