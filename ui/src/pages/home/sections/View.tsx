import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PinballRaceHeader from "../../../components/PinballRaceHeader";
import RaceDashboard from "../../../components/RaceDashboard";
import PinballRaceFooter from "../../../components/PinballRaceFooter";
import Leaderboard from "../../../components/Leaderboard";
import Data from "../../../components/data";
import AccountScreen from "../../../components/account";
import JoinRaceModal from "../../../components/JoinRaceModaloffline";
import { GrowthHome, PlaysLeftNote } from "../../../components/growth/GrowthSurfaces";
import { CHALLENGE_RETURN_KEY, shouldStartChallenge } from "../../../helpers/growth/flags";
import { loadGrowthSnapshot } from "../../../helpers/growth/client";

type ActiveTab = "Home" | "Winners" | "Data" | "Profile";

interface UserState {
  username?: string;
  pfp?: string;
  _id?: string;
}

const HOW_IT_WORKS = [
  { step: "1", title: "Choose your ball", desc: "Pick a ball from 1–15." },
  { step: "2", title: "Watch the race", desc: "Play an on-demand race filmed on the real track." },
  { step: "3", title: "Get your result", desc: "Results appear automatically when the race finishes." },
  { step: "4", title: "Play again", desc: "New races available every day. Open now. Play for free." },
];

const PinballRaceHome: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // ✅ Load saved tab from localStorage, or default to "Home"
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [challengeId, setChallengeId] = useState<string | undefined>(undefined);
  const [dailyOnDemandLimit, setDailyOnDemandLimit] = useState<number | null>(null);
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

  // Landing page already publishes the daily on-demand cap. Show it only when that
  // field is a real number — there is no separate "races remaining" endpoint.
  useEffect(() => {
    const pyServerUrl = import.meta.env.VITE_PY_SERVER_URL;
    if (!pyServerUrl) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${pyServerUrl}/landing`);
        if (!res.ok) return;
        const data = await res.json();
        const raw = data?.max_offline_race;
        const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        if (!cancelled && Number.isFinite(n) && n > 0) setDailyOnDemandLimit(n);
      } catch (err) {
        console.error("Failed to fetch on-demand limit:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Public "Play On-Demand Race" sends new accounts here so the Bunny modal opens.
  useEffect(() => {
    if (searchParams.get("play") !== "1") return;
    setChallengeId(undefined);
    setIsRaceModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("play");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // A challenge link only opens the race modal when that switch is on.
  useEffect(() => {
    const fromQuery = searchParams.get("challenge");
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(CHALLENGE_RETURN_KEY);
    } catch {
      stored = null;
    }
    const id = fromQuery || stored;
    if (!id) return;

    let cancel = false;
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    loadGrowthSnapshot(serverUrl).then((snap) => {
      if (cancel) return;
      try {
        sessionStorage.removeItem(CHALLENGE_RETURN_KEY);
      } catch {
        // Storage can be blocked. The query param is still cleared below.
      }
      if (fromQuery) {
        const next = new URLSearchParams(searchParams);
        next.delete("challenge");
        setSearchParams(next, { replace: true });
      }
      if (!shouldStartChallenge(snap, id)) return;
      setChallengeId(id);
      setIsRaceModalOpen(true);
    });

    return () => {
      cancel = true;
    };
  }, [searchParams, setSearchParams]);

  return (
    <div className="bg-black min-h-screen text-white pb-24 flex flex-col">
        <div className="fixed inset-0 pointer-events-none z-0">
    </div>
      <PinballRaceHeader username={user.username} pfp={user.pfp} />
    
      <main className={activeTab === "Home" ? "flex-1" : "flex-1 p-4 space-y-6"}>
        {activeTab === "Home" && (
          <>
            <section className="relative overflow-hidden px-6 py-12 sm:py-16 text-center">
              <div className="absolute inset-0 z-0 bg-[#0a0a0a]">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover opacity-30"
                >
                  <source src="/demo.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black"></div>
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <p className="text-xs sm:text-sm uppercase tracking-[0.25em] text-purple-300 font-semibold mb-4">
                  Open now · Play for free
                </p>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 text-transparent bg-clip-text mb-4">
                  Pick a Ball. Win the Race.
                </h1>
                <p className="text-gray-300 text-base sm:text-lg max-w-2xl mb-6">
                  Choose your ball. Watch the race. Results appear automatically when the race finishes. New races available every day.
                </p>
                {dailyOnDemandLimit !== null && (
                  <p className="text-sm text-gray-400 mb-6">
                    Up to {dailyOnDemandLimit.toLocaleString()} on-demand races a day.
                  </p>
                )}
                <button
                  onClick={() => {
                    setChallengeId(undefined);
                    setIsRaceModalOpen(true);
                  }}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-8 py-4 rounded-xl text-md font-bold text-white shadow-lg shadow-purple-500/30 transition-all"
                >
                  Play On-Demand Race
                </button>
                <PlaysLeftNote />
              </div>
            </section>

            <section className="px-6 py-12 bg-[#0a0a0a] border-t border-[#1e1e1e]">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10 text-white">How It Works</h2>
              <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
                {HOW_IT_WORKS.map((item) => (
                  <div key={item.step} className="text-center flex flex-col items-center">
                    <div className="w-12 h-12 mb-4 flex items-center justify-center bg-purple-600 text-white text-2xl font-bold rounded-xl shadow-lg shadow-purple-500/20">
                      {item.step}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white mb-2">{item.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <GrowthHome
              onWatchChallenge={(id) => {
                setChallengeId(id);
                setIsRaceModalOpen(true);
              }}
            />

            <section id="live-events" className="px-4 py-12 bg-[#111111] border-t border-[#1e1e1e]">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3 text-white">Live Events</h2>
              <p className="text-gray-400 text-sm text-center max-w-xl mx-auto mb-2">
                Optional. On-demand races are open now. A live race only appears here when one is scheduled.
              </p>
              <RaceDashboard
                username={user.username || ""}
                onViewStandings={() => {
                  handleTabChange("Winners");
                  setLeaderboardTab("Competitions");
                }}
              />
            </section>

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


