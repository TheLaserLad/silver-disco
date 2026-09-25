"use client";

import PointsDistribution from "./pointsbar";
import Crown1 from "../assets/crown.png";
import Medal_start1 from "../assets/medalstar.png";
import Medal1 from "../assets/medal.png";
import clock from "../assets/Leading-icon.png";
import timer from "../assets/timer.png";
import hashtag from "../assets/hashtag.png";
import gift from "../assets/gift.png";
import FavoriteBalls from "./FavoriteBalls";
import PlayerProfileModal from "./PlayerProfileModal";
import { useState, useEffect, useMemo } from "react";
import { ChevronDown, CirclePlus } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import b1 from "../assets/5balls/01.png";
import b2 from "../assets/5balls/02.png";
import b3 from "../assets/5balls/03.png";
import b4 from "../assets/5balls/04.png";
import b5 from "../assets/5balls/05.png";
import b6 from "../assets/balls/6.png";
import b7 from "../assets/balls/7.png";
import b8 from "../assets/balls/8.png";
import b9 from "../assets/balls/9.png";
import b10 from "../assets/balls/10.png";
import b11 from "../assets/balls/11.png";
import b12 from "../assets/balls/12.png";
import b13 from "../assets/balls/13.png";
import b14 from "../assets/balls/14.png";
import b15 from "../assets/balls/15.png";

const ballImages: { [key: string]: string } = {
  "Ball 1": b1,
  "Ball 2": b2,
  "Ball 3": b3,
  "Ball 4": b4,
  "Ball 5": b5,
  "Ball 6": b6,
  "Ball 7": b7,
  "Ball 8": b8,
  "Ball 9": b9,
  "Ball 10": b10,
  "Ball 11": b11,
  "Ball 12": b12,
  "Ball 13": b13,
  "Ball 14": b14,
  "Ball 15": b15,
};

// 🟣 Weekly Points Graph (kept as you had it)
const WeeklyPointsTrend = ({ graphData }: { graphData: any[] }) => {
  // 1. Process data to add the "Day" name (Mon, Tue, etc.)
  console.log("Graph Data Received:", graphData);
  const formattedData = useMemo(() => {
    return graphData.map((item) => {
      const dateObj = new Date(item.date);
      return {
        ...item,
        // Convert "2025-11-21" -> "Fri"
        dayName: dateObj.toLocaleDateString("en-US", { weekday: "short" }),
        // Format date for Tooltip (optional, e.g., "Nov 21")
        displayDate: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, [graphData]);

  return (
    <div className="w-full max-w-md bg-[#121212] rounded-xl p-4 shadow-lg mt-6">
      <h3 className="text-white font-semibold text-lg mb-4">
        Weekly Points Trend
      </h3>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={formattedData}
            margin={{
              top: 10,
              right: 10,
              left: -30,
              bottom: 0,
            }}
          >
            <CartesianGrid
              stroke="#333333"
              vertical={false}
              strokeDasharray="3 3"
            />
            
            {/* 2. Changed dataKey to "dayName" to show Fri, Sat, Sun... */}
            <XAxis
              dataKey="dayName" 
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={[0, "dataMax + 50"]} // Ensures the graph isn't flat if values are low
              tickFormatter={(tick: number) => tick.toString()}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e1e24",
                border: "1px solid #444",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#ffffff", marginBottom: "0.2rem" }}
              itemStyle={{ color: "#8b5cf6" }}
              // 3. Custom formatter to show readable Date in tooltip
              labelFormatter={(label, payload) => {
                 if (payload && payload.length > 0) {
                    return payload[0].payload.displayDate; // Shows "Nov 21" instead of "Fri"
                 }
                 return label;
              }}
              formatter={(value: number) => [`${value} Points`, "Points"]}
            />
            
            <Area
              type="monotone"
              dataKey="points"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.4}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface WeeklyPoint {
  date: string;
  points: number;
}

// 🟣 Performance Stats (kept logic)
const PerformanceStats = () => {
  const [stats, setStats] = useState({
    totalRaces: 0,
    totalPoints: 0,
    totalWins: 0,
    finishRate: 0,
    weeklyPoints: [] as WeeklyPoint[],
    pointsOverTime: {},
    favoriteBalls: [1, 2, 3, 4, 5],
  });

  const [loading, setLoading] = useState(true);
  const [, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    async function fetchStats() {
    try {
      // Fetch user info
      const userRes = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/user/me`, {
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
      const data = await statsRes.json();

        if (statsRes.ok || statsRes.status === 200) {
          setStats({
            totalRaces: data.totalRaces ?? 0,
            totalPoints: data.points ?? 0,
            totalWins: data.totalWins ?? 0,
            // calculate finish rate as percentage using totalwins/totalraces * 100
            finishRate: data.totalRaces
              ? Math.round((data.totalWins / data.totalRaces) * 100)
              : 0,
            weeklyPoints: data.weeklyTrend ?? [],
            pointsOverTime: data.pointsOverTime ?? {},
            favoriteBalls: data.favoriteBalls ?? [1],
          });
        } else {
          console.error("Failed to fetch stats:", data);
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-md text-center text-gray-400 mt-10">
        Loading your stats...
      </div>
    );
  }

  return (
    // need to create a round box around it
    <div className="box-border flex flex-col items-start p-3 gap-5 bg-[#121212] border border-[#242424] rounded-[20px] mx-auto">
      <h2 className="text-white font-semibold text-2xl mb-4">Stats</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1f1f1f] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-white mb-1">
            {stats.totalRaces}
          </p>
          <p className="text-sm text-gray-400">Total races</p>
        </div>
        <div className="bg-[#1f1f1f] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-green-500 mb-1">
            {stats.totalPoints}
          </p>
          <p className="text-sm text-gray-400">Total points</p>
        </div>
        <div className="bg-[#1f1f1f] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-blue-400 mb-1">
            {stats.totalWins}
          </p>
          <p className="text-sm text-gray-400">Number of wins</p>
        </div>
        <div className="bg-[#1f1f1f] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-red-400 mb-1">
            {stats.finishRate}%
          </p>
          <p className="text-sm text-gray-400">Average finish rate</p>
        </div>
      </div>

      {/* Graph below stats (left as-is) */}
      <WeeklyPointsTrend graphData={stats.weeklyPoints} />

      <div className="w-full max-w-md mt-6">
        <PointsDistribution pointsOverTime={stats.pointsOverTime} />
      </div>
      <div className="w-full max-w-md mt-6">
        <FavoriteBalls balls={stats.favoriteBalls} />
      </div>
    </div>
  );
};

interface UserData {
  user?: {
    _id: string;
    email?: string;
    username?: string;
  };
}
interface ApiTopFinisher {
  /** Empty when the game document never recorded one — the name stays plain text then. */
  userId: string;
  name: string;
  position: string;
  time: string;
  ball: string;
  iconType: string;
  /** Emoji, already built server-side. Empty when the player picked no country. */
  flag?: string;
  /** Daily participation streak; 0 once it lapses, and then not shown. */
  currentStreak?: number;
}
interface ApiRace {
  id: string;
  mode: string;
  startTimestamp: number;
  endTimestamp: number;
  duration: string;
  position: string;
  yourBall: string;
  topFinishers: ApiTopFinisher[];
}
interface UiTopFinisher extends Omit<ApiTopFinisher, 'iconType'> {
  icon: string; // The imported image path
}


export interface UiRace extends Omit<ApiRace, 'topFinishers'> {
  timeRange: string;
  yourBallImage: string;
  topFinishers: UiTopFinisher[];
}
const formatTimeRange = (startMs: number, endMs: number): string => {
  const format = (ms: number): string => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  };
  return `${format(startMs)} – ${format(endMs)}`;
};

// 🟣 Main Component — syntax fixed, icon references fixed, ball/hash placed correctly
export default function RaceHistory() {
  const [activeTab, setActiveTab] = useState("history");
  const [selectedDate, setSelectedDate] = useState("Today");
  const [races, setRaces] = useState<UiRace[]>([]);
  const [showDateOptions, setShowDateOptions] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState("All");
  const [showGameTypeOptions, setShowGameTypeOptions] = useState(false);
  const [, setUserData] = useState<UserData>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<{ userId: string; username: string } | null>(null);
  const dateOptions = [
    "Today",
    "Yesterday",
    "Last 7 days",
    "Last 30 days",
    "Last 90 days",
    "12 months",
    "All time",
    "Custom date",
  ];

  const gameTypeOptions = ["All", "Regular", "Lottery", "Elimination","Offline"];
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
// 2. EFFECT 1: Fetch User Data ONLY (Runs once on mount)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userRes = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/user/me`, {
          credentials: "include",
        });
        const userJson = await userRes.json();
        const fetchedUserId = userJson.user?._id;
        
        // Save user data
        setUserData({ 
          user: { 
            _id: fetchedUserId, 
            username: userJson.user?.username, 
            email: userJson.user?.email 
          } 
        });
        
        // Set the ID to trigger the second effect
        if (fetchedUserId) setUserId(fetchedUserId);
        
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };
    fetchUser();
  }, []); // Empty array = runs once

  // 3. EFFECT 2: Fetch Races (Runs when userId, Date, or GameType changes)
  useEffect(() => {
    // If we don't have a user ID yet, don't run this
    if (!userId) return;

    const fetchRaces = async () => {
      try {
        const raceRes = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/user/race-history`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          // Use the state variables here
          body: JSON.stringify({ 
            userId: userId, 
            limit: 100, 
            gameType: selectedGameType, 
            date: selectedDate 
          }),
        });

        if (!raceRes.ok) throw new Error("Network response was not ok");
        const data = await raceRes.json() as ApiRace[];      
        
        const mappedRaces: UiRace[] = data.map((r) => ({
          ...r,
          timeRange: formatTimeRange(r.startTimestamp, r.endTimestamp),
          yourBallImage: ballImages[r.yourBall] || "",
          topFinishers: r.topFinishers.map((f) => ({
              ...f,
              icon: f.position === "1st" ? Crown1 : (f.position === "2nd" ? Medal_start1 : (f.position === "3rd" ? Medal1 : "")),
          }))
        }));

        setRaces(mappedRaces);
      } catch (error) {
        console.error("Error fetching races:", error);
      }
    };

    fetchRaces();
  }, [userId, selectedGameType, selectedDate]); // 👈 Triggers refetch when these change


  return (
    <div className="w-full max-w-md box-border flex flex-col items-start p-3 gap-5bg-[#121212] border border-[#242424] rounded-[20px] self-stretch flex-none order-1 z-[1] m-auto">
      {/* Tabs */}
      <div className="flex bg-[#1c1c22] rounded-xl p-1 mb-6 w-full max-w-md">
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            activeTab === "history" ? "bg-[#8b6fed]" : "text-gray-400"
          }`}
          onClick={() => setActiveTab("history")}
        >
          Race History
        </button>
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            activeTab === "performance" ? "bg-[#8b6fed]" : "text-gray-400"
          }`}
          onClick={() => setActiveTab("performance")}
        >
          Performance
        </button>
      </div>

      {activeTab === "history" && (
        <>
          {/* Race History Header */}
          
          <div className="w-full max-w-md mb-2">
            <h2 className="text-white font-semibold text-lg">Race history</h2>
          

          {/* Filters */}
          <div className="flex justify-between items-center w-full max-w-md bg-[#1c1c22] p-3 rounded-xl mb-5 relative">
            {/* Game Type Dropdown */}
            <div className="relative w-[48%]">
              <button
                onClick={() => setShowGameTypeOptions(!showGameTypeOptions)}
                className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
              >
                {selectedGameType}
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showGameTypeOptions && (
                <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
                  {gameTypeOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSelectedGameType(option);
                        setShowGameTypeOptions(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] transition ${
                        option === selectedGameType ? "bg-[#2b2b36]" : ""
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Dropdown */}
            {/* TODO: Implement Custom Date Picker */}
            <div className="relative w-[48%]">
              <button
                onClick={() => {
                setShowDateOptions(!showDateOptions);
                // Reset custom view if closing the dropdown
                if (showDateOptions) setIsCustomDateActive(false);
                }}
                className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
              >
                {selectedDate}
                <ChevronDown size={16} className="text-gray-400" />
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

          {/* Race Cards list */}
          <div className="w-full max-w-md space-y-4">
            {races.map((race, index) => (
              <div
                key={index}
                className="bg-[#1f1f1f] rounded-2xl p-4 border border-gray-800 shadow-lg"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white font-medium">{race.id}</span>
                  <span className="bg-[#1f1f1f] text-white text-xs px-2 py-1 rounded-lg">
                    {race.mode}
                  </span>
                </div>

                {/* 2x2 stat boxes */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm text-gray-300">
                  {/* Time range */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={clock}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-white text-sm">
                        {race.timeRange}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Time range</p>
                  </div>

                  {/* Duration */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={timer}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-white text-sm">
                        {race.duration}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Duration</p>
                  </div>

                  {/* Your position */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={gift}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-purple-400 text-sm">
                        {race.position}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Your position</p>
                  </div>

                  {/* Your ball: shows '#' and ball number 7 on Left */}
                    <div className="flex items-center justify-between bg-[#121212] rounded-xl p-3">
                    <div className="flex flex-col items-start">
                        <div className="flex items-center gap-2">
                        <img src={hashtag} alt="#" className="w-5 h-5 object-contain" />
                        {/* if race.yourBallImage == "" then load circlePlus */}
                        {race.yourBallImage ? (
                        <img 
                            src={race.yourBallImage} 
                            alt="ball" 
                            className="w-5 h-5 object-contain" 
                        />
                        ) : (
                        <CirclePlus className="w-5 h-5" />
                        )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Your ball</p>
                    </div>
                    </div>
                </div>

                {/* Top 3 finishers */}
                <div>
                  <p className="text-gray-400 text-sm mb-2">Top 3 finishers</p>
                  <div className="space-y-2">
                    {race.topFinishers.map((f, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-[#121212] p-3 rounded-xl border border-gray-800"
                      >
                        <div className="min-w-0">
                          <p className="text-white font-semibold text-sm flex items-center gap-2 truncate">
                            {f.flag && <span className="shrink-0">{f.flag}</span>}
                            {f.userId ? (
                              <button
                                onClick={() =>
                                  setOpenProfile({ userId: f.userId, username: f.name })
                                }
                                className="truncate hover:text-[#8b6fed] transition"
                              >
                                {f.name}
                              </button>
                            ) : (
                              <span className="truncate">{f.name}</span>
                            )}
                            {!!f.currentStreak && (
                              <span className="text-xs text-orange-400 font-normal shrink-0">
                                🔥 {f.currentStreak}
                              </span>
                            )}
                          </p>
                          <p className="text-xs">
                            <span className="text-purple-400 font-semibold">
                              {f.position} Position
                            </span>{" "}
                            <span className="text-gray-400">• {f.ball}</span>{" "}
                          </p>
                        </div>

                        {/* show the imported icon image */}
                        {f.icon && (
                        <img
                            src={f.icon}
                            alt={`${f.name}-icon`}
                            className="w-6 h-6 object-contain"
                        />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
            ))}
          </div>
          </div>
        </>
      )}

      {activeTab === "performance" && <PerformanceStats />}

      {openProfile && (
        <PlayerProfileModal
          userId={openProfile.userId}
          username={openProfile.username}
          onClose={() => setOpenProfile(null)}
        />
      )}
    </div>
  );
}
