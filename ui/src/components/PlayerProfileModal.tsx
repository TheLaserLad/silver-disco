"use client";

import React, { useEffect, useState } from "react";
import { X, User, Flame } from "lucide-react";

/** The full /api/player/{id}/profile payload — account.tsx only reads a subset. */
interface PlayerProfile {
  identity: {
    userId: string;
    username: string;
    country: string;
    flag: string;
    /** Milliseconds, the same unit the Node API writes on the user document. */
    joinDate?: number | null;
    profileImage?: string;
  };
  currentStatus: {
    weeklyRank: number;
    weeklyPoints: number;
    currentStreak: number;
    longestStreak: number;
    championshipActive: boolean;
  };
  career: {
    totalRaces: number;
    totalWins: number;
    totalPodiums: number;
    totalPoints: number;
    winPercentage: number;
    podiumPercentage: number;
  };
  championships: {
    entered: number;
    wins: number;
    bestWeeklyFinish: number | null;
    top10Finishes: number;
  };
}

interface Props {
  userId: string;
  /** Known from the row that was clicked, so the header is filled in while loading. */
  username?: string;
  onClose: () => void;
}

const Stat: React.FC<{ value: React.ReactNode; label: string; accent?: string }> = ({
  value,
  label,
  accent = "text-white",
}) => (
  <div className="bg-[#121212] rounded-xl p-3 flex flex-col items-center justify-center">
    <p className={`text-xl font-bold mb-0.5 ${accent}`}>{value}</p>
    <p className="text-[11px] text-gray-500 text-center leading-tight">{label}</p>
  </div>
);

const formatJoinDate = (ms?: number | null) => {
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

/**
 * Feature 4 — the public profile, as a popup rather than its own page so a
 * username stays clickable without navigating away from the leaderboard or the
 * race history the player was reading.
 */
const PlayerProfileModal: React.FC<Props> = ({ userId, username, onClose }) => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/player/${userId}/profile`
        );
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch (err) {
        console.error("Failed to load player profile:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Escape closes, same as the cross.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const identity = profile?.identity;
  const status = profile?.currentStatus;
  const career = profile?.career;
  const champs = profile?.championships;
  const joined = formatJoinDate(identity?.joinDate);
  const displayName = identity?.username ?? username ?? "Player";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1c1c22] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex justify-between items-center p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white truncate">Player profile</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white transition shrink-0"
          >
            <X size={22} />
          </button>
        </header>

        {loading ? (
          <p className="text-gray-400 text-center py-12">Loading profile…</p>
        ) : error || !profile ? (
          <p className="text-gray-400 text-center py-12">
            Could not load this player's profile.
          </p>
        ) : (
          <div className="p-4 space-y-4">
            {/* Identity */}
            <div className="flex items-center gap-3">
              {identity?.profileImage ? (
                <img
                  src={identity.profileImage}
                  alt={displayName}
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                  <User size={26} className="text-white" />
                </div>
              )}

              <div className="min-w-0">
                <h3 className="text-white font-semibold text-xl flex items-center gap-2 truncate">
                  {identity?.flag && <span>{identity.flag}</span>}
                  <span className="truncate">{displayName}</span>
                </h3>
                <p className="text-xs text-gray-500">
                  {identity?.country || "No country set"}
                  {joined && ` • joined ${joined}`}
                </p>
              </div>
            </div>

            {/* Streak — the one number the whole retention phase is built around */}
            <div className="bg-[#121212] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Flame size={20} className="text-orange-400" />
                <div>
                  <p className="text-lg font-semibold text-white">
                    {status?.currentStreak ?? 0} Days
                  </p>
                  <p className="text-xs text-gray-500">Current streak</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-white">
                  {status?.longestStreak ?? 0} Days
                </p>
                <p className="text-xs text-gray-500">Longest streak</p>
              </div>
            </div>

            {/* This week — only meaningful while a championship is running */}
            {status?.championshipActive && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  This week
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    value={status.weeklyRank > 0 ? `#${status.weeklyRank}` : "—"}
                    label="Weekly rank"
                    accent="text-[#8b6fed]"
                  />
                  <Stat value={status.weeklyPoints} label="Weekly points" />
                </div>
              </div>
            )}

            {/* Career */}
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                Career
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Stat value={career?.totalRaces ?? 0} label="Races" />
                <Stat
                  value={career?.totalWins ?? 0}
                  label="Wins"
                  accent="text-blue-400"
                />
                <Stat
                  value={career?.totalPodiums ?? 0}
                  label="Podiums"
                  accent="text-yellow-400"
                />
                <Stat
                  value={career?.totalPoints ?? 0}
                  label="Points"
                  accent="text-green-500"
                />
                <Stat value={`${career?.winPercentage ?? 0}%`} label="Win rate" />
                <Stat
                  value={`${career?.podiumPercentage ?? 0}%`}
                  label="Podium rate"
                />
              </div>
            </div>

            {/* Championships — hidden for players who have never entered one */}
            {!!champs && champs.entered > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  Championships
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={champs.entered} label="Entered" />
                  <Stat
                    value={champs.wins}
                    label="Won"
                    accent="text-yellow-400"
                  />
                  <Stat
                    value={
                      champs.bestWeeklyFinish ? `#${champs.bestWeeklyFinish}` : "—"
                    }
                    label="Best weekly finish"
                  />
                  <Stat value={champs.top10Finishes} label="Top 10 finishes" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerProfileModal;
