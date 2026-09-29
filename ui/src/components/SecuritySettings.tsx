"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";

interface SecuritySettingsProps {
  id: string;
  username?: string;
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

const SecuritySettings = ({ id, username }: SecuritySettingsProps) => {
  const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPasswordStatus = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/user/password`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load security settings.");
          return;
        }
        setHasPassword(Boolean(data.hasPassword));
      } catch {
        if (!cancelled) setError("Could not load security settings.");
      }
    };

    loadPasswordStatus();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newPassword) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (hasPassword && !currentPassword) {
      setError("Enter your current password.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${serverUrl}/api/user/password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : "",
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (
          data.error === "Enter your current password." ||
          data.error === "Current password is incorrect."
        ) {
          setHasPassword(true);
        }
        setError(data.error || "Could not update your password.");
        return;
      }
      setSuccess(data.message || "Your password has been saved.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
    } catch {
      setError("Could not update your password. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    if (
      window.confirm(
        "Are you absolutely sure you want to delete your account? This action is irreversible."
      )
      // once confirmed send request to delete account
    ) {
      if (id) {
        // Absolute URL: this endpoint lives on the Python API, so a
        // relative path hit the frontend's own origin and 404'd.
        fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/account/deletion?user_id=${id}`,
          { method: "DELETE", credentials: "include" }
        )
          .then((response) => {
            if (response.ok) {
              alert(
                "Account deleted Initially. it will take up to 30 days to be fully removed."
              );
              // Optionally, redirect the user or update the UI
            } else {
              alert("Failed to delete account. Please try again later.");
            }
          })
          .catch((deleteError) => {
            console.error("Error deleting account:", deleteError);
            alert("An error occurred. Please try again later.");
          });
      } else {
        alert("User data is not available. Cannot delete account.");
      }
      // proceed with deletion logic
      // ...
    }
  };

  return (
    <div className="w-full max-w-md bg-[#0b0b0f] text-white p-4 md:p-8 rounded-2xl shadow-2xl">
      <div className="mb-10">
        <h2 className="text-xl font-bold text-white mb-2">Security settings</h2>
        <p className="text-sm text-gray-400 mb-4">
          {hasPassword === null
            ? "Checking how you sign in."
            : hasPassword
              ? "Enter your current password, then choose a new one."
              : "This account does not have a password yet. Set one to sign in with a password."}
        </p>

        {success && (
          <p className="text-sm text-green-400 mb-4" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-400 mb-4" role="alert">
            {error}
          </p>
        )}

        {hasPassword !== null && (
          <form onSubmit={handleSave} className="space-y-4">
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username || ""}
              readOnly
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            {hasPassword && (
              <PasswordField
                id="current-password"
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                shown={showCurrent}
                onToggle={() => setShowCurrent((shown) => !shown)}
                autoComplete="current-password"
              />
            )}
            <PasswordField
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              shown={showNew}
              onToggle={() => setShowNew((shown) => !shown)}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              shown={showConfirm}
              onToggle={() => setShowConfirm((shown) => !shown)}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500">
              Use at least {MIN_PASSWORD_LENGTH} characters.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
            >
              {saving ? "Saving..." : hasPassword ? "Save password" : "Set password"}
            </button>
          </form>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold text-red-500 mb-2">Danger zone</h2>
        <p className="text-sm text-gray-400 mb-6">
          Once you delete your account, there is no going back. Please be
          certain.
        </p>

        <button
          onClick={handleDeleteAccount}
          className="w-full bg-transparent border border-red-600 text-red-600 font-semibold py-3 rounded-xl flex items-center justify-center space-x-2 hover:bg-red-900/20 transition"
        >
          <Trash2 size={20} />
          <span>Delete account</span>
        </button>
      </div>
    </div>
  );
};

function PasswordField({
  id,
  label,
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="bg-[#1c1c22] p-4 rounded-xl shadow-lg">
      <label htmlFor={id} className="text-sm font-medium text-gray-400 block mb-3">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="w-full bg-[#1c1c22] text-white p-2 pr-10 text-base border-b border-gray-700 focus:outline-none focus:border-purple-600"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition p-2"
          aria-label={shown ? "Hide password" : "Show password"}
        >
          {shown ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </div>
  );
}

export default SecuritySettings;
