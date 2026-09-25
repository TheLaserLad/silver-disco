"use client";

import React, { useState, useEffect } from "react";
import JoinRaceModal from "../components/JoinRaceModal";
import ChampionshipWidget from "./ChampionshipWidget";
import leadingicon from "../assets/Leading-icon.png";
import contact from "../assets/contact.png";
import gift from "../assets/gift.png";
import entry from "../assets/entry.png";
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
  "1": b1,
  "2": b2,
  "3": b3,
  "4": b4,
  "5": b5,
  "6": b6,
  "7": b7,
  "8": b8,
  "9": b9,
  "10": b10,
  "11": b11,
  "12": b12,
  "13": b13,
  "14": b14,
  "15": b15,
};

interface RaceDashboardProps {
  username: string; // Optional because data might still be loading
  /** Switches the page to the Winners tab — the dashboard does not own the tabs. */
  onViewStandings?: () => void;
}

function getNextRaceStartTime(createdAt: number, timerTillNextRace?: number): string {
  const seconds = timerTillNextRace || 0;
  const startDate = new Date(createdAt + seconds * 1000); // was * 60 * 1000

  const hours = startDate.getHours().toString().padStart(2, "0");
  const mins = startDate.getMinutes().toString().padStart(2, "0");
  const secs = startDate.getSeconds().toString().padStart(2, "0");

  return `${hours}:${mins}:${secs}`;
}

function getRemainingSeconds(raceStartMs: number) {
  return Math.max(0, Math.floor((raceStartMs - Date.now()) / 1000));
}
interface Game {
  status: "Not Started" | "Ongoing" | "Finished";
  gameType: string;
  gameNumber?: string;
  timerTillNextGame?: number; // backend sends int
  participants?: any[];
  entry?: string;
  prizeId?: string;
  prizeTitle?: string | null;
  createdAt: number; // fix from createdAT
}

interface GameResponse {
  games: Game[];
}



const ProgressBar: React.FC<{ time: number; maxTime: number }> = ({ time, maxTime }) => {
  const percentage = Math.min((time / maxTime) * 100, 100);
  return (
    <div className="w-full bg-gray-800 rounded-full h-2">
      <div
        className="bg-[#8a6fec] h-2 rounded-full transition-all duration-500 ease-in-out"
        style={{ width: `${percentage}%` }}
      ></div>
    </div>
  );
};

const RaceDashboard: React.FC<RaceDashboardProps> = ({ username, onViewStandings }) => {
  const [showModal, setShowModal] = useState(false);
  const [recentRaces, setRecentRaces] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'me'>('all');  
  const [games, setGames] = useState<Game[]>([]);
  const [remaining, setRemaining] = useState<number>(0);
  const currentGameType = games[0]?.gameType || "----";
  const currentGameNumber = games[0]?.gameNumber || "----";
  const currentRaceTime = games[0]?.timerTillNextGame || 0;
  let participantsCount = games[0]?.participants?.length || 0;
  if (currentGameNumber === "----") participantsCount = 0;
  const [participants, setParticipants] = useState<number>(participantsCount);
  const createdAt = games[0]?.createdAt || 0;
  const starttimeofgame = getNextRaceStartTime(createdAt, currentRaceTime);
  const gamestarttime = starttimeofgame.split(":").slice(0,2).join(":") || "xx:xx";
  const currentEntry = games[0]?.entry || "free";
  const currentgift = games[0]?.prizeTitle || "Points Only";
  const isGameUnavailable = currentGameNumber === "----";
  const [timerData, setTimerData] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>("--:--:--");
  const raceStartMs = createdAt + (currentRaceTime || 0) * 1000;
  const maxTimeSec = currentRaceTime || 0;

  // TODO: make it so that we can filter out user own data too
  // ✅ Fetch data from backend LeaderboardTemp
    useEffect(() => {
    const fetchTimerData = async () => {
        try {
        const res = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/timer_data`);
        const data = await res.json();
        setTimerData(data.timer);
        } catch (err) {
        console.error("Failed to fetch timer data", err);
        }
    };
    fetchTimerData();
    }, []);

    useEffect(() => {
    if (currentGameType !== "----" || timerData === null) return;

    const interval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const diff = timerData - now;

        if (diff <= 0) {
        setCountdown("00:00:00");
        clearInterval(interval);
        return;
        }

        const h = Math.floor(diff / 3600).toString().padStart(2, "0");
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, "0");
        const s = (diff % 60).toString().padStart(2, "0");
        setCountdown(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
    }, [timerData, currentGameType]);
  useEffect(() => {
  const fetchRecentRaces = async () => {
    try {
      console.log("🔄 Fetching leaderboard data...");
      
      const pyServerUrl = import.meta.env.VITE_PY_SERVER_URL;
      const url = new URL(`${pyServerUrl}/api/leaderboard/recent`);
      if (filterMode === 'me' && username) {
          url.searchParams.append("username", username);
        }

      const res = await fetch(url.toString());


      // Check if request failed
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }

      const data = await res.json();

      // If your backend sends [...] for recent
      if (Array.isArray(data) && data.length > 0) {
          
          setRecentRaces(data.slice(0, 3));
        
      } else {
        console.error("Unexpected data format");
      }
    } catch (err) {
      console.error("Error fetching leaderboard");
    }
  };

  fetchRecentRaces();
// 2. Setup the polling interval ONLY when on the 'all' tab
    let interval: ReturnType<typeof setInterval>;
    if (filterMode === 'all') {
      interval = setInterval(() => {
        fetchRecentRaces();
      }, 5000); // Refreshes every 5 seconds (adjust as needed)
    }

    // 3. Cleanup interval when unmounting or switching tabs
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [filterMode, username]);

useEffect(() => { fetchGames(); }, []);
  const fetchGames = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/games/fetch`);

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data: GameResponse = await res.json(); 

        if (Array.isArray(data.games)) {
        const gamesList = data.games;
        const upcomingGames = gamesList
            .filter((g) => g.status === "Not Started" && typeof g.createdAt === "number")
            .sort((a, b) => a.createdAt! - b.createdAt!);

            if (upcomingGames.length > 0) {
            setGames([upcomingGames[0]]);

            } else {
                setGames([]);
            
            }
        
        }
        else{
            console.error("data fetching good error in filtering")
        }
    } catch (err) {
      console.error("❌ Error fetching games");
    }
  };

useEffect(() => {
  const interval = setInterval(() => {
    fetchGames(); // will update state if a new game appears
  }, 5000); // every 5 seconds

  return () => clearInterval(interval);
}, []);
useEffect(() => {
  if (!games.length) return;

  setRemaining(getRemainingSeconds(raceStartMs));

  const timer = setInterval(() => {
    const remain = getRemainingSeconds(raceStartMs);
    setRemaining(remain);
    if (remain <= 0) {
      clearInterval(timer);
      fetchGames();
    }
  }, 1000);

  return () => clearInterval(timer);
}, [games, raceStartMs]);

useEffect(() => {
  if (games?.[0]) {
    setParticipants(games[0].participants?.length || 0);
  }
}, [games]);

useEffect(() => {
  if (!currentGameNumber) return;

  const fetchParticipants = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/games/fetch`);
      if (!res.ok) return;
      const data: GameResponse = await res.json();
      const updatedGame = data.games?.find(
        (g) => g.gameNumber === currentGameNumber
      );
      if (updatedGame) setParticipants(updatedGame.participants?.length || 0);
    } catch (err) {
      console.error("⚠ Error updating participants", err);
    }
  };

  fetchParticipants();
  const pInterval = setInterval(fetchParticipants, 10000);
  return () => clearInterval(pInterval);
}, [currentGameNumber]);

  if (!games)
    return (
      <div className="text-white text-center py-10">
        <p>Loading next race...</p>
      </div>
    );

  return (
    <div className="w-full flex justify-center px-3 sm:px-6 lg:px-10 py-6">
      <div className="w-full max-w-6xl text-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#121212] rounded-2xl p-4 shadow border border-gray-800 flex flex-col justify-between">
  <div>
    <h2 className="text-sm text-white mb-1">
      Next Live race{" "}
      <span className="text-indigo-400">
        {currentGameType === "----" ? countdown : `(${currentGameType})`}
      </span>
    </h2>
    <p className="text-gray-300 text-sm mb-3">
      #{currentGameNumber}
    </p>


    {/* ✅ Dynamic Progress Bar */}
    <ProgressBar time={remaining} maxTime={maxTimeSec} />

    {/* Info grid */}
    <div className="grid grid-cols-2 gap-2 text-sm mb-4 p-2">

      {/* 🕓 Start Time */}
      <div className="bg-[#1a1a1a] p-2 rounded-lg flex flex-col items-start text-left">
        <div className="flex items-center justify-start gap-2">
          <img
            src={leadingicon}
            alt="Clock Icon"
            className="w-4 h-4 object-contain opacity-80"
          />
          <span className="text-xl font-semibold text-white leading-none">{gamestarttime}</span>
        </div>
        <span className="text-gray-400 text-xs ml-6 mt-1">Start time</span>
      </div>

      {/* 👥 Participants */}
      <div className="bg-[#1a1a1a] p-2 rounded-lg flex flex-col items-start text-left">
        <div className="flex items-center justify-start gap-2">
          <img
            src={contact}
            alt="Participants Icon"
            className="w-5 h-5 rounded-full object-cover"
          />
          <span className="text-base font-semibold text-white">
            {participants}
          </span>

        </div>
        <span className="text-gray-400 text-xs ml-6 mt-1">Participants</span>
      </div>

      {/* 💸 Entry */}
      <div className="bg-[#1a1a1a] p-2 rounded-lg flex flex-col items-start text-left">
        <div className="flex items-center justify-start gap-2">
          <img
            src={entry}
            alt="Entry Icon"
            className="w-5 h-5 object-contain"
          />
          <span className="text-base font-semibold text-white">{currentEntry}</span>

        </div>
        <span className="text-gray-400 text-xs ml-6 mt-1">Entry</span>
      </div>

      {/* 🏆 Prize */}
      <div className="bg-[#1a1a1a] p-2 rounded-lg flex flex-col items-start text-left">
        <div className="flex items-center justify-start gap-2">
          <img
            src={gift}
            alt="Prize Icon"
            className="w-5 h-5 object-contain"
          />
          <span className="text-base font-semibold text-white">{currentgift}</span>
        </div>
        <span className="text-gray-400 text-xs ml-6 mt-1">Prize</span>
      </div>

    </div>
  </div>

  {/* 🔘 Join Button */}
    <button
    className={`w-full font-semibold py-2 rounded-3xl border transition ${
        isGameUnavailable 
        ? "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed" 
        : "bg-[#121212] text-white border-[#522cab] hover:border-blue-600 hover:bg-[#0a0a0a]"
    }`}
    onClick={() => setShowModal(true)}
    disabled={isGameUnavailable}
    >
    {isGameUnavailable ? "No Race Available" : "Play next Live Race"}
    </button>
</div>



    {/* Header Row: Title + Toggle on the same line */}
    <div className="bg-[#121212] rounded-2xl p-4 shadow border border-gray-800 flex flex-col gap-2">

          {/* Header Row: Title + Toggle on the same line */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm text-gray-400">Recent races</h2>
            
            <div className="bg-[#0a0a0a] border border-[#333] rounded-full p-1 flex items-center relative h-8 w-24">
                {/* Sliding Background */}
                <div 
                    className={`absolute top-1 bottom-1 w-[44px] bg-[#522cab] rounded-full transition-all duration-300 ease-in-out ${
                        filterMode === 'all' ? 'left-1' : 'left-[49px]'
                    }`}
                />
            
            <button
                onClick={() => setFilterMode('all')}
                className={`flex-1 text-xs font-bold z-10 transition-colors duration-200 ${
                    filterMode === 'all' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
            >
                All
            </button>
            <button
                onClick={() => setFilterMode('me')}
                className={`flex-1 text-xs font-bold z-10 transition-colors duration-200 ${
                    filterMode === 'me' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
            >
                Me
            </button>
        </div>
        </div>
          {recentRaces.length === 0 ? (
            <p className="text-gray-500 text-sm">No recent races found</p>
          ) : (
            recentRaces.map((race) => (
            <div
            key={`${race.raceId}-${race.createdAt}`}
            className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded-xl  mb-2 hover:bg-gray-800 transition"
            >
            {/* Added flex-1 and min-w-0 to allow this container to shrink instead of expanding past the screen */}
            <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="min-w-0 w-full">
                
                {/* Added truncate to prevent long IDs from breaking layout */}
                <p className="text-sm truncate">
                    {"#"}{race.raceId}
                </p>
                
                {/* Added truncate to prevent long usernames from breaking layout */}
                <p className="text-sm text-gray-400 truncate">
                    <span className="text-[#8b6fed] text-xs font-bold">{race.isOffline ? race.position : "Winner"}</span> •{" "}
                    <span className="text-[#767676]">{race.username || "No Winner"}</span>
                </p>

                {/* Swapped space-x-2 for gap-2 and added flex-wrap so balls drop to the next line if needed */}
                <div className="mt-1 flex items-center gap-2 min-w-0 w-full">
                {race.top5Balls && Array.isArray(race.top5Balls) ? (
                    race.top5Balls.map((ballNum: number, bIndex: number) => (
                    <img 
                        key={bIndex} 
                        src={ballImages[String(ballNum)]} 
                        alt={`Ball ${ballNum}`} 
                        /* 1. Removed flex-shrink-0 
                        2. Added shrink (allows image to scale down)
                        3. Added min-w-0 (prevents flexbox from forcing the image to its native minimum width)
                        */
                        className="w-5 h-5 object-contain shrink min-w-0" 
                    />
                    ))
                ) : (
                    <span className="text-xs text-gray-500">No balls data</span>
                )}
                </div>
    </div>
  </div>
  
  {/* Added ml-2 and flex-shrink-0 so the arrow always stays glued to the right edge and remains visible */}
  <span className="text-gray-400 text-lg ml-2 flex-shrink-0">&gt;</span>
</div>
            ))
          )}
        </div>

        {/* ----- Championship (Feature 6) ----- */}
        <ChampionshipWidget onViewAll={onViewStandings} />

</div>


      {showModal && <JoinRaceModal onClose={() => setShowModal(false)}     
      gameType={currentGameType}
      gameNumber={currentGameNumber} />}
    </div>
  );
};

export default RaceDashboard;




