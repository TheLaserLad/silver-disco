"use client";
import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { avatarUrl } from "../helpers/avatar/avatarUrl";

interface UserData {
  _id: string;
  username?: string;
  email?: string;
  pfp?: string;
  clientToken?: string;
  connectedAccounts?: {
    google: boolean;
    tiktok: boolean;
    twitch: boolean;
  };
}

/** What the save returns to the account screen so it can update in place. */
export interface ProfileUpdate {
  username?: string;
  pfp?: string;
}

// The avatar is stored inline on the user document and ships with every
// leaderboard row, so the original file is downscaled to this before upload.
const AVATAR_SIZE = 256;

// Guard against handing a multi-hundred-megabyte file to FileReader.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Turn a picked file into a square data URI the API will accept.
 *
 * Cover-crops to a square rather than stretching, so the circular frame never
 * distorts the photo. JPEG loses transparency, which is the right trade here —
 * the avatar always sits on an opaque circle anyway.
 */
const toAvatarDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image."));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process that image."));
          return;
        }
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const EditProfileModal = ({
  onClose = () => {},
  onUpdate = () => {},
  userData,
}: {
  onClose?: () => void;
  onUpdate?: (updated: ProfileUpdate) => void;
  userData: UserData;
}) => {
  const [displayName, setDisplayName] = useState("");
  // null means "untouched" — only a picked or removed avatar is sent, because
  // an OAuth login leaves a provider URL in pfp that the API would reject.
  const [pendingPfp, setPendingPfp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(userData.username ?? "");
    setPendingPfp(null);
  }, [userData]);

  const shownPfp = pendingPfp !== null ? pendingPfp : userData.pfp ?? "";

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is too large. Pick one under 10MB.");
      return;
    }

    try {
      setError(null);
      setPendingPfp(await toAvatarDataUri(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  };

  const handleUpdate = async () => {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 30) {
      setError("Name must be 2-30 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = new URLSearchParams({ userId: userData._id, username: name });
      if (pendingPfp !== null) body.set("pfp", pendingPfp);

      const res = await fetch(
        `${import.meta.env.VITE_PY_SERVER_URL}/api/user/profile`,
        {
          method: "POST",
          // Sends the session cookie so the API can verify who is being edited.
          credentials: "include",
          body,
        }
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Server responded with ${res.status}`);
      }
      // Only forward the fields the server actually wrote. It echoes back just
      // what it updated, so on a name-only save there is no `pfp` key — and a
      // `pfp: undefined` would still clobber the existing avatar when the
      // account screen spreads this over its state.
      const json = await res.json();
      const updated: ProfileUpdate = {};
      if (typeof json.username === "string") updated.username = json.username;
      if (typeof json.pfp === "string") updated.pfp = json.pfp;
      onUpdate(updated);
      onClose();
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c1c22] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center p-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Edit profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </header>

        {/* Body */}
        <div className="p-4 space-y-6">
          {/* Profile Picture */}
          <div className="flex items-center space-x-4">
            {/* Falls through to the generated avatar when there is nothing set,
                so Remove previews exactly what the player ends up with rather
                than an empty circle they cannot interpret. */}
            <div className="w-16 h-16 rounded-full bg-purple-600 overflow-hidden shrink-0">
              <img
                src={avatarUrl(userData._id, shownPfp)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handlePick}
              className="hidden"
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={saving}
              className="bg-[#2b2b36] text-gray-300 text-sm px-4 py-2 rounded-lg font-medium hover:bg-[#3b3b46] transition disabled:opacity-50"
            >
              Change profile
            </button>
            {shownPfp && (
              <button
                onClick={() => setPendingPfp("")}
                disabled={saving}
                className="text-gray-500 text-sm hover:text-gray-300 transition disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {/* Display Name */}
          <div>
            <label className="text-sm font-medium text-gray-400 block mb-1">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              maxLength={30}
              disabled={saving}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#2b2b36] text-white p-3 rounded-xl border border-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              This is the name shown on the leaderboards.
            </p>
          </div>

          {/* Email — read-only: it is the login identity and is unique per
              account, so changing it needs a dedupe + verification flow. */}
          <div>
            <label className="text-sm font-medium text-gray-400 block mb-1">
              Email
            </label>
            <input
              type="email"
              value={userData.email ?? ""}
              readOnly
              className="w-full bg-[#2b2b36] text-gray-400 p-3 rounded-xl border border-gray-700 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your email is tied to how you sign in and can't be changed here.
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <footer className="flex justify-end p-4 space-x-3 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 font-semibold px-4 py-2 rounded-lg hover:bg-[#2b2b36] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={saving}
            className="bg-purple-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Update"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default EditProfileModal;
