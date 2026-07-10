import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import { logout as logoutRequest } from "../api/auth";

import { getMe, getTags, updateMe, updateMeWithAvatar } from "../api/users";

import { useAuth } from "../context/AuthContext";

import type { Gender, Tag, User } from "../types/user";



function SettingsPage() {

  const navigate = useNavigate();

  const { logout: clearSession, refreshMe } = useAuth();



  const [user, setUser] = useState<User | null>(null);

  const [tags, setTags] = useState<Tag[]>([]);

  const [firstName, setFirstName] = useState("");

  const [lastName, setLastName] = useState("");

  const [gender, setGender] = useState<Gender>("male");

  const [canBeAdded, setCanBeAdded] = useState(true);

  const [selectedTagId, setSelectedTagId] = useState<number | "">("");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [newPassword, setNewPassword] = useState("");



  const [isSaving, setIsSaving] = useState(false);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [error, setError] = useState("");



  useEffect(() => {

    async function loadProfile() {

      try {

        const [profile, availableTags] = await Promise.all([getMe(), getTags()]);

        setUser(profile);

        setTags(availableTags);

        setFirstName(profile.first_name ?? "");

        setLastName(profile.last_name ?? "");

        setGender(profile.gender ?? "male");

        setCanBeAdded(profile.can_be_added_to_group ?? true);

        setSelectedTagId(

          typeof profile.tag === "object" && profile.tag

            ? profile.tag.id

            : typeof profile.tag === "number"

              ? profile.tag

              : ""

        );

        setAvatarPreview(profile.avatar_url ?? null);

      } catch {

        setError("Unable to load your profile.");

      }

    }



    void loadProfile();

  }, []);



  async function handleSave() {

    setIsSaving(true);

    setError("");



    try {

      const tagValue = selectedTagId === "" ? null : selectedTagId;

      let updated: User;



      if (avatarFile) {

        const formData = new FormData();

        formData.append("first_name", firstName);

        formData.append("last_name", lastName);

        formData.append("gender", gender);

        formData.append("can_be_added_to_group", String(canBeAdded));
        formData.append("tag", tagValue === null ? "" : String(tagValue));
        formData.append("avatar", avatarFile);

        updated = await updateMeWithAvatar(formData);

      } else {

        updated = await updateMe({

          first_name: firstName,

          last_name: lastName,

          gender,

          can_be_added_to_group: canBeAdded,

          tag: tagValue,

        });

      }



      setUser(updated);

      setAvatarPreview(updated.avatar_url ?? null);

      setAvatarFile(null);

      await refreshMe();

    } catch {

      setError("Could not save your changes. Please try again.");

    } finally {

      setIsSaving(false);

    }

  }



  async function handleLogout() {

    setIsLoggingOut(true);

    setError("");



    try {

      await logoutRequest();

      clearSession();

      navigate("/login", { replace: true });

    } catch {

      setError("Logout is unavailable right now. Please try again.");

    } finally {

      setIsLoggingOut(false);

    }

  }



  function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {

    const file = event.target.files?.[0];



    if (!file) return;



    setAvatarFile(file);

    setAvatarPreview(URL.createObjectURL(file));

  }



  if (!user) {

    return (

      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">

        <p className="text-sm text-white/60">Loading...</p>

      </main>

    );

  }



  return (

    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-8 lg:py-14">

      <div className="max-w-2xl">

        <p className="text-xs uppercase text-white/45">Account</p>

        <h1 className="mt-3 text-3xl font-semibold text-white">

          Settings

        </h1>

        <p className="mt-3 text-sm leading-7 text-white/60">

          Edit your profile and manage your session.

        </p>

      </div>



      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">

        <h2 className="font-semibold text-white">Avatar</h2>



        <div className="mt-4 flex items-center gap-4">

          {avatarPreview ? (

            <img

              src={avatarPreview}

              alt="Avatar preview"

              className="h-20 w-20 rounded-2xl border border-white/10 object-cover"

            />

          ) : (

            <div className="grid h-20 w-20 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xl font-semibold text-white">

              {firstName.charAt(0).toUpperCase() || "?"}

            </div>

          )}



          <input

            type="file"

            accept="image/*"

            onChange={handleAvatar}

            className="text-sm text-white/60 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/15"

          />

        </div>

      </section>



      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">

        <h2 className="font-semibold text-white">Personal Information</h2>



        <div className="mt-4 grid gap-4 sm:grid-cols-2">

          <input

            value={firstName}

            onChange={(e) => setFirstName(e.target.value)}

            placeholder="First name"

            className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none"

          />



          <input

            value={lastName}

            onChange={(e) => setLastName(e.target.value)}

            placeholder="Last name"

            className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none"

          />

        </div>



        <select

          value={gender}

          onChange={(e) => setGender(e.target.value as Gender)}

          className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white focus:border-white/20 focus:outline-none"

        >

          <option value="male">Male</option>

          <option value="female">Female</option>

          <option value="other">Other</option>

        </select>



        <select

          value={selectedTagId}

          onChange={(e) =>

            setSelectedTagId(e.target.value === "" ? "" : Number(e.target.value))

          }

          className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white focus:border-white/20 focus:outline-none"

        >

          <option value="">No tag</option>

          {tags.map((tag) => (

            <option key={tag.id} value={tag.id}>

              {tag.title}

            </option>

          ))}

        </select>



        <label className="mt-4 flex items-center gap-3 text-sm text-white/70">

          <input

            type="checkbox"

            checked={canBeAdded}

            onChange={(e) => setCanBeAdded(e.target.checked)}

            className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"

          />

          Allow adding to groups

        </label>

      </section>



      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">

        <h2 className="font-semibold text-white">Password</h2>



        <input

          type="password"

          value={newPassword}

          onChange={(e) => setNewPassword(e.target.value)}

          placeholder="New password"

          className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none"

        />



        <button

          type="button"

          disabled

          className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white/40"

        >

          Change password (Backend required)

        </button>

      </section>



      <div className="mt-6">

        <button

          type="button"

          disabled={isSaving}

          onClick={handleSave}

          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"

        >

          {isSaving ? "Saving..." : "Save Changes"}

        </button>

      </div>



      <section className="mt-8 flex items-center justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">

        <div>

          <h2 className="font-semibold text-white">Log out</h2>

          <p className="mt-2 text-sm leading-6 text-white/50">

            Close this session and return to the login page.

          </p>

        </div>



        <button

          type="button"

          disabled={isLoggingOut}

          onClick={handleLogout}

          className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/[0.08] px-5 text-sm font-semibold text-red-100 transition hover:border-red-400/30 hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-60"

        >

          {isLoggingOut ? "Logging out..." : "Log out"}

        </button>

      </section>



      {error && (

        <div

          role="alert"

          className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-5 py-4 text-sm text-red-100/80"

        >

          {error}

        </div>

      )}

    </main>

  );

}



export default SettingsPage;

