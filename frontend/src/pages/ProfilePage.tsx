import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getUserProfile } from "../api/users";
import type { PublicUser } from "../types/user";

export default function ProfilePage() {
  const { phone_number } = useParams();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    if (!phone_number) {
      setError("Invalid user");
      setLoading(false);
      return;
    }

    getUserProfile(phone_number)
      .then(setUser)
      .catch(() => {
        setError("Failed to load profile");
      })
      .finally(() => {
        setLoading(false);
      });

  }, [phone_number]);


  if (loading) {
    return <div>Loading profile...</div>;
  }


  if (error) {
    return <div>{error}</div>;
  }


  if (!user) {
    return <div>User not found</div>;
  }


  return (
    <div className="p-6">

      <h1 className="text-2xl font-bold">
        {user.first_name} {user.last_name}
      </h1>


      <p>
        Phone: {user.phone_number}
      </p>


      <p>
        Gender: {user.gender}
      </p>

    </div>
  );
}