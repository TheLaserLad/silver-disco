"use client";
import { useState } from "react";
import { Edit2, Eye, EyeOff, Trash2 } from "lucide-react";


interface SecuritySettingsProps {
  id: string;
}

const SecuritySettings = ({ id }: SecuritySettingsProps) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
                            alert("Account deleted Initially. it will take up to 30 days to be fully removed.");
                            // Optionally, redirect the user or update the UI
                        } else {
                            alert("Failed to delete account. Please try again later.");
                        }
                    })
                    .catch((error) => {
                        console.error("Error deleting account:", error);
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
      {/* Security Settings Section */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Security settings</h2>
          <Edit2
            size={16}
            className="text-purple-400 cursor-pointer hover:text-purple-300 transition"
          />
        </div>

        {/* Current Password Input */}
        <div className="bg-[#1c1c22] p-4 rounded-xl shadow-lg">
          <label className="text-sm font-medium text-gray-400 block mb-3">
            Current password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1c1c22] text-white p-2 text-xl tracking-widest border-b border-gray-700 focus:outline-none focus:border-purple-600"
              placeholder="••••••••••••••"
            />

            {/* Toggle Eye Icon */}
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition p-2"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone Section */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-red-500 mb-2">Danger zone</h2>
        <p className="text-sm text-gray-400 mb-6">
          Once you delete your account, there is no going back. Please be
          certain.
        </p>

        {/* Delete Account Button */}
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

export default SecuritySettings;
