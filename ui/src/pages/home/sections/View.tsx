import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { useSearchParams } from "react-router-dom";
import PinballRaceHeader from "../../../components/PinballRaceHeader";
import LiveStreamCard from "../../../components/LiveStreamCard";
import RaceDashboard from "../../../components/RaceDashboard";
import PinballRaceFooter from "../../../components/PinballRaceFooter";
import Leaderboard from "../../../components/Leaderboard";
import Data from "../../../components/data";
import AccountScreen from "../../../components/account";
import JoinRaceModal from "../../../components/JoinRaceModaloffline";
import { createChallengeInbox, loadChallengesOpen } from "../../../helpers/growth/challengeInbox.js";

const ChallengeInboxPanel = createChallengeInbox({
  useState,
  useEffect,
  jsx,
  jsxs,
});

type ActiveTab = "Home" | "Winners" | "Data" | "Profile";

interface UserState {
  username?: string;
  pfp?: string;
  _id?: string;
}

const PinballRaceHome: React.FC = () => {
  // ✅ Load saved tab from localStorage, or default to "Home"
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [challengeId, setChallengeId] = useState<string | undefined>(undefined);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const savedTab = localStorage.getItem("activeTab") as ActiveTab | null;
    return savedTab || "Home";
  });

  // ✅ User state for header props
  const [user, setUser] = useState<UserState>({});

  // Which sub-tab the Winners screen opens on. Tapping Winners in the footer
  // always lands on the all-time table; only the championship widget deep-links
  // past it to the live standings.
  const [leaderboardTab, setLeaderboardTab] = useState<"AllRaces" | "Competitions">(
    "AllRaces"
  );

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "Winners") setLeaderboardTab("AllRaces");
    localStorage.setItem("activeTab", tab); // ✅ Save tab choice
    console.log(`Navigation changed to: ${tab}`);
  };

  // ✅ Fetch user info once
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const serverUrl =
          import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
        const res = await fetch(`${serverUrl}/get_profile`, {
          credentials: "include",
        });

        if (!res.ok) {
          console.warn("⚠️ Failed to fetch user profile:", res.status);
          return;
        }

        const data = await res.json();
        const userData = data.user || data;



        setUser({
          username: userData.username,
          pfp: userData.pfp,
          _id: userData._id, 
        });
      } catch (err) {
        console.error("❌ Error fetching user:", err);
      }
    };

    fetchUser();
  }, []);

  // A challenge link opens the on-demand picker only when Challenges is on.
  useEffect(() => {
    const fromQuery = searchParams.get("challenge");
    const playNow = searchParams.get("play") === "1";
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("pinballrace.challenge");
    } catch {
      stored = null;
    }
    const id = fromQuery || stored;
    if (!id && !playNow) return undefined;
    let cancel = false;
    const serverUrl = import.meta.env.VITE_SERVER_URL || "https://pinballrace.com:8080";
    loadChallengesOpen(serverUrl).then((open) => {
      if (cancel) return;
      try {
        sessionStorage.removeItem("pinballrace.challenge");
      } catch {
        // Ignore private-mode storage.
      }
      if (fromQuery || playNow) {
        const next = new URLSearchParams(searchParams);
        next.delete("challenge");
        next.delete("play");
        setSearchParams(next, { replace: true });
      }
      if (playNow && !id) {
        setChallengeId(undefined);
        setIsRaceModalOpen(true);
        return;
      }
      if (open && id) {
        setChallengeId(id);
        setIsRaceModalOpen(true);
        setActiveTab("Home");
      }
    });
    return () => {
      cancel = true;
    };
  }, [searchParams, setSearchParams]);
// add a button that will call offline game when cliecked call join race model but the ball selected will be for offline game
// that ball selected will be sent to offline game and the user will be able to play offline game with that ball
// returning the url from the backend and opening it in a new tab
// max games per day is 3 
  return (
    <div className="bg-black min-h-screen text-white pb-24 flex flex-col">
        <div className="fixed inset-0 pointer-events-none z-0">
    </div>
      <PinballRaceHeader username={user.username} pfp={user.pfp} />
    
      <main className="flex-1 p-4 space-y-6">
        {activeTab === "Home" && (
          <>
            <LiveStreamCard />
            <RaceDashboard
              username={user.username || ""}
              onViewStandings={() => {
                handleTabChange("Winners");
                setLeaderboardTab("Competitions");
              }}
            />
            <ChallengeInboxPanel
              apiBase={import.meta.env.VITE_SERVER_URL || "https://pinballrace.com:8080"}
              onPlay={(id: string) => {
                setChallengeId(id);
                setIsRaceModalOpen(true);
              }}
            />
            <button
            className="w-full bg-[#121212] text-white font-semibold py-2 rounded-3xl border border-[#522cab] hover:border-blue-600 hover:bg-[#0a0a0a] transition shadow-[0_0_15px_rgba(82,44,171,0.3)]"
            onClick={() => {
              setChallengeId(undefined);
              setIsRaceModalOpen(true);
            }}
        >
            Play On-Demand Race
        </button>
        {isRaceModalOpen && (
        <JoinRaceModal 
          challengeId={challengeId}
          onClose={() => {
            setChallengeId(undefined);
            setIsRaceModalOpen(false);
          }}
          />
        )}
          </>
        )}
        {activeTab === "Winners" && (
          <Leaderboard userId={user._id} initialTab={leaderboardTab} />
        )}
        {activeTab === "Data" && <Data />}
        {activeTab === "Profile" && <AccountScreen />}
      </main>

      <PinballRaceFooter activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default PinballRaceHome;


