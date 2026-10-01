import { useEffect, useState } from "react";
import PinballRaceHeader from "../../../components/PinballRaceHeader";
import LiveStreamCard from "../../../components/LiveStreamCard";
import RaceDashboard from "../../../components/RaceDashboard";
import PinballRaceFooter from "../../../components/PinballRaceFooter";
import Leaderboard from "../../../components/Leaderboard";
import Data from "../../../components/data";
import AccountScreen from "../../../components/account";
import JoinRaceModal from "../../../components/JoinRaceModaloffline";
import ChampionshipEntryModal from "../../../components/ChampionshipEntryModal";
import {
  hasSeenChampionshipEntry,
  markChampionshipEntrySeen,
  shouldShowChampionshipEntry,
  snapshotFromChampionship,
  type ChampionshipEntrySnapshot,
} from "../../../helpers/championship/entryNotice";

type ActiveTab = "Home" | "Winners" | "Data" | "Profile";

interface UserState {
  username?: string;
  pfp?: string;
  _id?: string;
}

const PinballRaceHome: React.FC = () => {
  // ✅ Load saved tab from localStorage, or default to "Home"
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [streamRaceOpen, setStreamRaceOpen] = useState(false);
  const [entryNotice, setEntryNotice] = useState<ChampionshipEntrySnapshot | null>(null);
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

  const presentEntry = (
    snap: ChampionshipEntrySnapshot | null,
    newlyEntered?: boolean,
    racesThisChampionship?: number | null,
  ) => {
    if (!snap?.id) return;
    if (
      !shouldShowChampionshipEntry({
        championshipId: snap.id,
        newlyEntered,
        racesThisChampionship,
      })
    ) {
      return;
    }
    // Mark before paint so a second poll in the same turn cannot open it twice.
    markChampionshipEntrySeen(snap.id);
    setEntryNotice(snap);
  };

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

  // Live races finish on the server, not in this page's race-result response.
  // Once the player's first race of the week is on the board, show the same
  // popup — unless this browser already saw it, or an on-demand result is
  // about to deliver newlyEntered itself.
  useEffect(() => {
    const userId = user._id;
    // While the on-demand race modal is up, that response owns the popup.
    // Pausing here also covers an in-flight poll: its cleanup sets cancelled.
    const suppress = (isRaceModalOpen || streamRaceOpen) && activeTab === "Home";
    if (!userId || suppress) return;
    let cancelled = false;

    const check = async () => {
      try {
        const pyServerUrl = import.meta.env.VITE_PY_SERVER_URL;
        if (!pyServerUrl) return;
        const res = await fetch(
          `${pyServerUrl}/api/championship/leaderboard?userId=${encodeURIComponent(userId)}&limit=1`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const snap = snapshotFromChampionship(data?.championship);
        if (cancelled || !data?.active || !snap) return;
        if (hasSeenChampionshipEntry(snap.id)) return;
        const races =
          typeof data?.player?.races === "number" ? data.player.races : null;
        presentEntry(snap, undefined, races);
      } catch (err) {
        console.error("Failed to check championship entry:", err);
      }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // presentEntry only writes state; the once-guard is localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id, isRaceModalOpen, streamRaceOpen, activeTab]);
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
            <LiveStreamCard
              onChampionshipEntry={(snap) => presentEntry(snap, true)}
              onRaceModalChange={setStreamRaceOpen}
            />
            <RaceDashboard
              username={user.username || ""}
              onViewStandings={() => {
                handleTabChange("Winners");
                setLeaderboardTab("Competitions");
              }}
            />
            <button
            className="w-full bg-[#121212] text-white font-semibold py-2 rounded-3xl border border-[#522cab] hover:border-blue-600 hover:bg-[#0a0a0a] transition shadow-[0_0_15px_rgba(82,44,171,0.3)]"
            onClick={() => setIsRaceModalOpen(true)}
        >
            Play On-Demand Race
        </button>
        {isRaceModalOpen && (
        <JoinRaceModal
          onClose={() => setIsRaceModalOpen(false)}
          onChampionshipEntry={(snap) => presentEntry(snap, true)}
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

      {entryNotice && (
        <ChampionshipEntryModal
          championship={entryNotice}
          onDismiss={() => setEntryNotice(null)}
          onViewStandings={() => {
            setEntryNotice(null);
            setIsRaceModalOpen(false);
            setStreamRaceOpen(false);
            handleTabChange("Winners");
            setLeaderboardTab("Competitions");
          }}
        />
      )}
    </div>
  );
};

export default PinballRaceHome;


