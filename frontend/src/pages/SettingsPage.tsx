import { useEffect, useState } from "react";
import { getMe, updateMe } from "../api/users";
import type { Gender, User } from "../types/user";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [canBeAdded, setCanBeAdded] = useState(true);

  // local only (until backend supports it)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    getMe().then((data) => {
      setUser(data);
      setFirstName(data.first_name ?? "");
      setLastName(data.last_name ?? "");
      setGender(data.gender ?? "male");
      setCanBeAdded(data.can_be_added_to_group ?? true);
    });
  }, []);

  async function save() {
    const updated = await updateMe({
      first_name: firstName,
      last_name: lastName,
      gender,
      can_be_added_to_group: canBeAdded,
    });

    setUser(updated);
  }

  function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setAvatarPreview(URL.createObjectURL(file));
  }

  if (!user) return <p>Loading...</p>;

  return (
    <main className="settings-page">
      <h1>Edit Profile</h1>

      <section>
        <h2>Avatar</h2>

        <div>
          {avatarPreview ? (
            <img src={avatarPreview} width="100" height="100" />
          ) : (
            <div>
              {firstName.charAt(0).toUpperCase() || "?"}
            </div>
          )}
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={handleAvatar}
        />
      </section>


      <section>
        <h2>Personal Information</h2>

        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
        />

        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
        />


        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>


        <label>
          <input
            type="checkbox"
            checked={canBeAdded}
            onChange={(e) => setCanBeAdded(e.target.checked)}
          />
          Allow adding to groups
        </label>
      </section>


      <section>
        <h2>Password</h2>

        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
        />

        <button disabled>
          Change password (Backend required)
        </button>
      </section>


      <button onClick={save}>
        Save Changes
      </button>
    </main>
  );
}