"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, Trophy } from "lucide-react";

import first from "../assets/1st.png";
import second from "../assets/2nd.png";
import third from "../assets/3rd.png";
import ChampionshipStandings from "./ChampionshipStandings";
import PlayerProfileModal from "./PlayerProfileModal";

interface Player {
  /** Empty for rows served from a cache filled before the field existed. */
  userId: string;
  name: string;
  position: number;
  races: number;
  wins: number;
  points: number;
  /** Emoji, already built server-side. Empty when the player picked no country. */
  flag: string;
  /** Daily participation streak; 0 once it lapses, and then not shown. */
  currentStreak: number;
}

type Tab = "AllRaces" | "Competitions" | "HallOfChampions";

const TAB_LABELS: Record<Tab, string> = {
  AllRaces: "All Races",
  Competitions: "Competitions",
  HallOfChampions: "Hall of Champions",
};

interface LeaderboardProps {
  /** Logged-in player, forwarded so the Competitions tab can pin their rank. */
  userId?: string;
  /** Which tab to open on, so the homepage widget can deep-link to the standings. */
  initialTab?: Tab;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ userId, initialTab = "AllRaces" }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [leaderboardData, setLeaderboardData] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProfile, setOpenProfile] = useState<{ userId: string; username: string } | null>(null);

  const [showDateOptions, setShowDateOptions] = useState(false);
  const [selectedDate, setSelectedDate] = useState("Today");
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const dateOptions = [
    "Today",
    "Yesterday",
    "Last 7 days",
    "Last 30 days",
    "Last 90 days",
    "12 Months",
    "All time",
    "Custom date",
  ];

useEffect(() => {
  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      // Always the all-time board. Championship standings live on the
      // Competitions tab instead — serving them here too would show the same
      // table twice and make the all-time ranking unreachable for a whole week.
      const url = `${import.meta.env.VITE_PY_SERVER_URL}/api/leaderboard?timeline=${encodeURIComponent(selectedDate)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const data = await res.json();

      if (data.data && Array.isArray(data.data)) {
        const formatted: Player[] = data.data.map((user: any, i: number) => ({
          userId: user.userId ?? "",
          name: user.username,
          position: i + 1,             // Already sorted by backend
          races: user.races,
          wins: user.numberOfWins,
          points: user.points,
          // Absent on rows still being served from a cache filled before these
          // fields existed, so fall back rather than render "undefined".
          flag: user.flag ?? "",
          currentStreak: user.currentStreak ?? 0,
        }));

        setLeaderboardData(formatted);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  fetchLeaderboard();
}, [selectedDate]);


  return (
    <div className="bg-black min-h-screen flex flex-col items-center py-6 px-4">
      {/* Tabs */}
      <div className="flex w-full max-w-2xl bg-[#111] rounded-xl p-1 mb-6">
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            // min-w-0 so three labels shrink to fit a phone instead of pushing
            // the pill out past the screen.
            className={`flex-1 min-w-0 py-2 px-1 rounded-lg font-semibold text-sm transition truncate ${
              activeTab === tab ? "bg-[#8a6fec] text-white" : "text-gray-400"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* All Races Tab */}
      {activeTab === "AllRaces" && (
        <div
          className="w-full max-w-2xl bg-gradient-to-b via-[#1e1b2e] to-black backdrop-blur-md rounded-2xl p-6 shadow-xl border border-gray-800 relative"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(39, 21, 82, 0.4), #1e1b2e, #000000)",
          }}
        >
          {/* Header with Dropdown */}
          {/* TODO: Implement Custom Date Picker */}

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white font-semibold text-xl text-left">Leaderboard</h2>

            <div className="relative w-[48%] sm:w-[180px]">
              <button
                onClick={() => {
                setShowDateOptions(!showDateOptions);
                // Reset custom view if closing the dropdown
                if (showDateOptions) setIsCustomDateActive(false);
                }}
                className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
              >
                <span className="truncate">{selectedDate}</span>
                    <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                </button>

{showDateOptions && (
                <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
                {!isCustomDateActive ? (
                    // Standard Options List
                    dateOptions.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => {
                        if (option === "Custom date") {
                            setIsCustomDateActive(true);
                        } else {
                            setSelectedDate(option);
                            setShowDateOptions(false);
                        }
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] transition"
                    >
                        {option}
                    </button>
                    ))
                ) : (
                    // Custom Range Picker View
                    <div className="p-3 space-y-2 bg-[#1c1c22]">
                    <p className="text-xs text-gray-500 font-medium">Select Range</p>
                    <input
                        type="date"
                        className="w-full bg-[#2b2b36] text-white text-xs p-2 rounded-lg border border-gray-600 outline-none"
                        onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                    />
                    <input
                        type="date"
                        className="w-full bg-[#2b2b36] text-white text-xs p-2 rounded-lg border border-gray-600 outline-none"
                        onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                    />
                    <div className="flex gap-2 pt-1">
                        <button
                        onClick={() => setIsCustomDateActive(false)}
                        className="flex-1 text-xs text-gray-400 hover:text-white"
                        >
                        Back
                        </button>
                        <button
                        onClick={() => {
                            if (customRange.start && customRange.end) {
                            setSelectedDate(`${customRange.start} - ${customRange.end}`);
                            setShowDateOptions(false);
                            setIsCustomDateActive(false);
                            }
                        }}
                        className="flex-1 bg-[#8b6fed] text-white text-xs py-2 rounded-lg font-medium"
                        >
                        Apply
                        </button>
                    </div>
                    </div>
                )}
                </div>
            )}
            </div>
            </div>

          {/* Leaderboard Data */}
          {loading ? (
            <p className="text-gray-400 text-center">Loading leaderboard...</p>
          ) : leaderboardData.length === 0 ? (
            <p className="text-gray-400 text-center">
              No leaderboard data found for selected date.
            </p>
          ) : (
            <div className="space-y-3">
              {leaderboardData.map((player) => {
                let icon = null;
                if (player.position === 1)
                  icon = <img src={first} alt="1st" className="w-5 h-5 object-contain" />;
                else if (player.position === 2)
                  icon = <img src={second} alt="2nd" className="w-5 h-5 object-contain" />;
                else if (player.position === 3)
                  icon = <img src={third} alt="3rd" className="w-5 h-5 object-contain" />;

                return (
                  <div
                    key={`${player.name}-${player.position}`}
                    className="flex justify-between items-center bg-white/5 backdrop-blur-md rounded-xl p-4 shadow-md border border-white/10 hover:bg-white/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <h3 className="text-white font-semibold text-lg flex items-center gap-2 truncate">
                          {player.flag && <span className="shrink-0">{player.flag}</span>}
                          {player.userId ? (
                            <button
                              onClick={() =>
                                setOpenProfile({ userId: player.userId, username: player.name })
                              }
                              className="truncate hover:text-[#8b6fed] transition"
                            >
                              {player.name}
                            </button>
                          ) : (
                            <span className="truncate">{player.name}</span>
                          )}
                          {!!player.currentStreak && (
                            <span className="text-xs text-orange-400 font-normal shrink-0">
                              🔥 {player.currentStreak}
                            </span>
                          )}
                        </h3>
                        <p className="text-sm">
                          <span className="text-[#8b6fed] font-semibold">
                            {player.position} Position
                          </span>{" "}
                          • <span className="text-gray-400">{player.races} Races</span> •{" "}
                          <span className="text-gray-400">{player.wins} Wins</span> •{" "}
                          <span className="text-gray-400">{player.points} Points</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-yellow-400">{icon}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Competitions Tab */}
      {activeTab === "Competitions" && <ChampionshipStandings userId={userId} />}

      {/* Hall of Champions Tab — placeholder until the feature is built out. */}
      {activeTab === "HallOfChampions" && (
        <div className="w-full max-w-2xl rounded-2xl">
          <div className="relative rounded-2xl p-8 shadow-lg border border-gray-800 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-[#271552]/60 to-black"></div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-[#8b6fed]/15 border border-[#8b6fed]/30 flex items-center justify-center mb-4">
                <Trophy size={26} className="text-[#8b6fed]" />
              </div>

              <h3 className="text-white font-bold text-xl mb-2">Hall of Champions</h3>
              <p className="text-gray-400 text-sm max-w-sm mb-6">
                A permanent record of every championship winner.
              </p>

              <span className="text-xs uppercase tracking-wider text-[#8b6fed] bg-[#8b6fed]/10 border border-[#8b6fed]/30 px-4 py-1.5 rounded-full">
                In development
              </span>
            </div>
          </div>
        </div>
      )}

      {openProfile && (
        <PlayerProfileModal
          userId={openProfile.userId}
          username={openProfile.username}
          onClose={() => setOpenProfile(null)}
        />
      )}
    </div>
  );
};

export default Leaderboard;




