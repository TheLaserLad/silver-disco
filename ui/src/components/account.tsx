"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Search,
  Bell,
  Edit2,
  Flag,
  Clock,
  Award,
  Trophy,
  LogOut,
  Globe,
  Video,
  MessageSquare,
  Flame,
} from "lucide-react";

import EditProfileModal, { type ProfileUpdate } from "./EditProfileModal";
import NotificationSettings from "./NotificationSettings";
import SecuritySettings from "./SecuritySettings";
import { COUNTRIES } from "../helpers/country/countries";
import { avatarUrl } from "../helpers/avatar/avatarUrl";
import axios from "axios";


interface Stat {
  icon: React.ElementType;
  value: number;
  label: string;
  color?: string;
}

interface ConnectedAccount {
  name: string;
  icon: React.ElementType;
  status: string;
  action: string;
  actionColor: string;
}

interface UserData {
  _id: string;
  username?: string;
  email?: string;
  /** Either an uploaded data URI or the avatar URL an OAuth login supplied. */
  pfp?: string;
  clientToken?: string;
  connectedAccounts?: {
    google: boolean;
    tiktok: boolean;
    twitch: boolean;
  };
}

interface StatsData {
  totalRaces: number;
  points: number;
  totalWins: number;
  streak?: number;
  finishRate?: number;
  weeklyPoints: { name: string; points: number }[];
}

/** Subset of /api/player/{id}/profile that this screen renders. */
interface ProfileData {
  identity: {
    country: string;
    flag: string;
  };
  currentStatus: {
    weeklyRank: number;
    weeklyPoints: number;
    currentStreak: number;
    longestStreak: number;
    championshipActive: boolean;
  };
}


const AccountScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState("Profile");
  const [showModal, setShowModal] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [savingCountry, setSavingCountry] = useState(false);

  const [loading, setLoading] = useState(true);

  const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

  // Country drives the flag shown next to the username on every leaderboard.
  // No login provider supplies it, so the player picks it here.
  const saveCountry = async (code: string) => {
    if (!code || !userData) return;
    setSavingCountry(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/user/country`, {
        method: "POST",
        // Sends the session cookie so the API can verify who is being edited.
        credentials: "include",
        body: new URLSearchParams({ userId: userData._id, country: code }),
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const json = await res.json();
      setProfile((prev) =>
        prev
          ? { ...prev, identity: { ...prev.identity, country: json.country, flag: json.flag } }
          : prev
      );
    } catch (err) {
      console.error("Failed to save country:", err);
    } finally {
      setSavingCountry(false);
    }
  };
  const logout = async () => {
    try {
      await axios.post(`${serverUrl}/unrestricted/logout`, {}, { withCredentials: true });
      // Redirect to login page
      window.location.href = "/";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Fetch user data and stats
  useEffect(() => {
  const fetchUserAndStats = async () => {
    try {
      // Fetch user info
      const userRes = await fetch(`${serverUrl}/api/user/me`, {
        credentials: "include",
      });
      const userJson = await userRes.json();
      if (userJson.user) setUserData(userJson.user);

      // Fetch stats for logged-in usersendinf useremail
      const statsRes = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/user/stats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email: userJson.user._id }),
      });
      const statsJson: StatsData = await statsRes.json();

      // Map stats to frontend Stat[]. Note statsJson.streak is winningStreak —
      // consecutive *wins*, not the daily-participation streak below.
      setStats([
        { icon: Flag, value: statsJson.totalRaces ?? 0, label: "Races" },
        { icon: Clock, value: statsJson.points ?? 0, label: "Points", color: "text-green-400" },
        { icon: Award, value: statsJson.streak ?? 0, label: "Win Streak" },
        { icon: Trophy, value: statsJson.totalWins ?? 0, label: "Wins" },
      ]);

      // Daily streak + weekly championship standing. Fetched separately so a
      // failure here still leaves the stats above rendered.
      try {
        const profileRes = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/player/${userJson.user._id}/profile`
        );
        if (profileRes.ok) setProfile(await profileRes.json());
      } catch (err) {
        console.error("Failed to fetch player profile:", err);
      }

    } catch (err) {
      console.error("Failed to fetch user or stats:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchUserAndStats();
}, [ serverUrl ]);


  // Handle connect/disconnect actions
  const handleAction = async (platform: string, action: string) => {
    if (action === "Connect") {
      switch (platform.toLowerCase()) {
        case "google":
          window.location.href = `${serverUrl}/auth/google`;
          break;
        case "tiktok":
          window.location.href = `${serverUrl}/authenticate_tiktok`;
          break;
        case "twitch":
          window.location.href = `${serverUrl}/unrestricted/twitch`;
          break;
      }
      return;
    }

    // Disconnect
    try {
      await fetch(`${serverUrl}/api/user/disconnect/${platform.toLowerCase()}`, {
        method: "POST",
        credentials: "include",
      });

      setUserData((prev) =>
        prev
          ? {
              ...prev,
              connectedAccounts: {
                google: platform === "Google" ? false : prev.connectedAccounts?.google ?? false,
                tiktok: platform === "TikTok" ? false : prev.connectedAccounts?.tiktok ?? false,
                twitch: platform === "Twitch" ? false : prev.connectedAccounts?.twitch ?? false,
              },
            }
          : prev
      );
    } catch (err) {
      console.error(`Failed to disconnect ${platform}:`, err);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen text-gray-400">Loading account...</div>;
  }

  if (!userData) {
    return <div className="flex justify-center items-center h-screen text-gray-400">No user data found.</div>;
  }

  const connectedAccounts: ConnectedAccount[] = [
    {
      name: "Google",
      icon: Globe,
      status: userData.connectedAccounts?.google ? "Connected" : "Not Connected",
      action: userData.connectedAccounts?.google ? "Disconnect" : "Connect",
      actionColor: userData.connectedAccounts?.google ? "bg-red-700 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-500",
    },
    {
      name: "TikTok",
      icon: Video,
      status: userData.connectedAccounts?.tiktok ? "Connected" : "Not Connected",
      action: userData.connectedAccounts?.tiktok ? "Disconnect" : "Connect",
      actionColor: userData.connectedAccounts?.tiktok ? "bg-red-700 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-500",
    },
    {
      name: "Twitch",
      icon: MessageSquare,
      status: userData.connectedAccounts?.twitch ? "Connected" : "Not Connected",
      action: userData.connectedAccounts?.twitch ? "Disconnect" : "Connect",
      actionColor: userData.connectedAccounts?.twitch ? "bg-red-700 hover:bg-red-600" : "bg-purple-600 hover:bg-purple-500",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white p-4 md:p-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <ArrowLeft size={24} className="text-white cursor-pointer" />
          <h1 className="text-xl font-bold">Account</h1>
        </div>
        <div className="flex items-center space-x-4">
          <Search size={20} className="text-white cursor-pointer" />
          <Bell size={20} className="text-white cursor-pointer" />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-[#1c1c22] rounded-xl p-1 mb-8 w-full max-w-sm">
        {["Profile", "Notifications", "Security"].map((tab) => (
          <button
            key={tab}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab ? "bg-purple-600 text-white" : "text-gray-400 hover:bg-[#2b2b36]"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "Profile" && (
        <>
          {/* Profile Info */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Profile information</h2>
              <Edit2 size={18} className="text-purple-400 cursor-pointer hover:text-purple-300 transition" onClick={() => setShowModal(true)} />
            </div>

            <div className="bg-[#1c1c22] p-4 rounded-xl flex items-center mb-4">
              {/* The purple fill stays as the backdrop: it is what shows if the
                  avatar itself fails to load. */}
              <div className="w-12 h-12 rounded-full bg-purple-600 mr-4 overflow-hidden shrink-0">
                <img
                  src={avatarUrl(userData._id, userData.pfp)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-lg font-semibold">{userData.username}</p>
                <p className="text-sm text-gray-400">{userData.email}</p>
              </div>
              <p className="ml-auto text-sm text-gray-500 hidden sm:block">ID: {userData.clientToken}</p>
            </div>

            {/* Country — shown as a flag beside your name on every leaderboard */}
            {profile && (
              <div className="bg-[#1c1c22] p-4 rounded-xl mb-4">
                <label className="text-sm font-medium text-gray-400 block mb-2">
                  Country
                </label>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl w-8 text-center shrink-0">
                    {profile.identity.flag || "🏳️"}
                  </span>
                  {/* min-w-0 is load-bearing: a <select> is as wide as its
                      longest option ("British Indian Ocean Territory"), and a
                      flex item defaults to min-width:auto, so without this it
                      refuses to shrink and overflows the card on a phone. */}
                  <select
                    value={profile.identity.country || ""}
                    disabled={savingCountry}
                    onChange={(e) => saveCountry(e.target.value)}
                    className="flex-1 min-w-0 bg-[#2b2b36] text-white p-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-600 disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Select your country
                    </option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Stats */}
            { (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Flag, value: stats[0]?.value ?? 0, label: "Races" },
                  { icon: Clock, value: stats[1]?.value ?? 0, label: "Points", color: "text-green-400" },
                  { icon: Award, value: stats[2]?.value ?? 0, label: "Streak" },
                  { icon: Trophy, value: stats[3]?.value ?? 0, label: "Wins" },
                ].map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <div key={index} className="bg-[#1c1c22] p-4 rounded-xl flex items-center space-x-3">
                      <Icon size={20} className={stat.color || "text-purple-400"} />
                      <div>
                        <p className={`text-lg font-semibold ${stat.color || "text-white"}`}>{stat.value}</p>
                        <p className="text-xs text-gray-400">{stat.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

            )}

            {/* Daily participation streak — one race on a calendar day keeps it alive */}
            {profile && (
              <div className="bg-[#1c1c22] p-4 rounded-xl mt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Flame size={20} className="text-orange-400" />
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {profile.currentStatus.currentStreak} Days
                      </p>
                      <p className="text-xs text-gray-400">Current streak</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">
                      {profile.currentStatus.longestStreak} Days
                    </p>
                    <p className="text-xs text-gray-400">Longest streak</p>
                  </div>
                </div>

                {profile.currentStatus.championshipActive && (
                  <div className="flex items-center justify-between border-t border-gray-800 mt-3 pt-3">
                    <p className="text-xs text-gray-400">This week's championship</p>
                    <p className="text-sm text-[#8b6fed] font-semibold">
                      {profile.currentStatus.weeklyPoints} pts
                      {profile.currentStatus.weeklyRank > 0 &&
                        ` • rank #${profile.currentStatus.weeklyRank}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>



          {/* Connected Accounts */}
          <div className="mb-10 mt-6">
            <h2 className="text-lg font-semibold text-white mb-4">Connected accounts</h2>
            {connectedAccounts.map((account, index) => {
              const Icon = account.icon;
              return (
                <div key={index} className={`flex justify-between items-center py-3 ${index < connectedAccounts.length - 1 ? "border-b border-gray-800" : ""}`}>
                  <div className="flex items-center space-x-3">
                    <Icon size={20} className="text-gray-400" />
                    <div>
                      <p className="text-white font-medium">{account.name}</p>
                      <p className="text-sm text-gray-400">{account.status}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAction(account.name, account.action)}
                    className={`text-white text-sm px-4 py-2 rounded-lg font-medium transition ${account.actionColor}`}
                  >
                    {account.action}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Logout */}
          <div className="flex justify-center mt-6">
            <button
              onClick={logout}
              className="flex items-center space-x-2 text-red-500 font-semibold text-lg p-3 rounded-xl hover:bg-[#1c1c22] transition"
            >
              <LogOut size={20} />
              <span>Log out</span>
            </button>
          </div>
        </>
      )}

      {/* Notifications */}
      {activeTab === "Notifications" && <NotificationSettings userId={userData._id} />}

      {/* Security */}
      {activeTab === "Security" && <SecuritySettings id={userData._id} />}

      {/* Edit Profile Modal */}
      {showModal && (
        <EditProfileModal
          onClose={() => setShowModal(false)}
          // Merge rather than refetch: the modal already returns the saved
          // values, so the card and avatar update without a round trip.
          onUpdate={(updated: ProfileUpdate) =>
            setUserData((prev) => (prev ? { ...prev, ...updated } : prev))
          }
          userData={userData}
        />
      )}
    </div>
  );
};

export default AccountScreen;
