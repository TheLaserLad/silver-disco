"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";

import first from "../assets/1st.png";
import second from "../assets/2nd.png";
import third from "../assets/3rd.png";
import formatRemaining from "../helpers/date/formatRemaining";
import PlayerProfileModal from "./PlayerProfileModal";

/** A row of /api/championship/leaderboard. */
interface Standing {
  rank: number;
  userId: string;
  username: string;
  country: string;
  flag: string;
  pfp: string;
  weeklyPoints: number;
  races: number;
  wins: number;
  podiums: number;
  bonusPoints: number;
  currentStreak: number;
  /** Places gained since the day started — positive means climbed. */
  positionChange: number;
}

interface Championship {
  id: string;
  name: string;
  sponsor?: string;
  description?: string;
  weekNumber?: number;
  endDate?: number;
  dailyBonusRaces: number;
  dailyBonusPoints: number;
}

/** One of the three archived podium places on /api/championship/history. */
interface ArchivePlace {
  userId: string;
  username: string;
  country?: string;
  flag?: string;
  pfp?: string;
  score: number;
}

/** A finished championship, newest first. */
interface ArchivedChampionship {
  championshipId: string;
  name: string;
  sponsor?: string;
  weekNumber?: number;
  startDate?: number;
  endDate?: number;
  champion: ArchivePlace | null;
  secondPlace: ArchivePlace | null;
  thirdPlace: ArchivePlace | null;
  participantCount: number;
  prize?: string;
  /** Where the logged-in player finished. Null if they never entered this one. */
  you: { rank: number; points: number; races: number; wins: number } | null;
}

interface Props {
  /** Logged-in player, so the API can return their own rank row. */
  userId?: string;
}

const podiumIcon = (rank: number) => {
  if (rank === 1) return <img src={first} alt="1st" className="w-5 h-5 object-contain" />;
  if (rank === 2) return <img src={second} alt="2nd" className="w-5 h-5 object-contain" />;
  if (rank === 3) return <img src={third} alt="3rd" className="w-5 h-5 object-contain" />;
  return null;
};

const PositionChange: React.FC<{ change: number }> = ({ change }) => {
  if (!change) return null;
  return (
    <span
      className={`text-xs font-semibold ${change > 0 ? "text-green-400" : "text-red-400"}`}
      title={`${change > 0 ? "Up" : "Down"} ${Math.abs(change)} since the day started`}
    >
      {change > 0 ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
};

const StandingRow: React.FC<{
  row: Standing;
  highlight?: boolean;
  onSelect: (row: Standing) => void;
}> = ({ row, highlight, onSelect }) => (
  <div
    className={`flex justify-between items-center rounded-xl p-4 shadow-md border transition-all duration-300 ${
      highlight
        ? "bg-[#8b6fed]/10 border-[#8b6fed]/50"
        : "bg-white/5 border-white/10 hover:bg-white/10"
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-gray-500 font-semibold text-sm w-7 shrink-0">{row.rank}</span>
      <div className="min-w-0">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2 truncate">
          {row.flag && <span>{row.flag}</span>}
          {row.userId ? (
            <button
              onClick={() => onSelect(row)}
              className="truncate hover:text-[#8b6fed] transition"
            >
              {row.username}
            </button>
          ) : (
            <span className="truncate">{row.username}</span>
          )}
          {highlight && (
            <span className="text-[10px] uppercase tracking-wider text-[#8b6fed] shrink-0">
              You
            </span>
          )}
          {!!row.currentStreak && (
            <span className="text-xs text-orange-400 font-normal shrink-0">
              🔥 {row.currentStreak}
            </span>
          )}
        </h3>
        <p className="text-sm">
          <span className="text-[#8b6fed] font-semibold">{row.weeklyPoints} pts</span>
          {" • "}
          <span className="text-gray-400">{row.races} Races</span>
          {" • "}
          <span className="text-gray-400">{row.wins} Wins</span>
          {row.bonusPoints > 0 && (
            <>
              {" • "}
              <span className="text-gray-400" title="Daily participation bonus">
                +{row.bonusPoints} bonus
              </span>
            </>
          )}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      <PositionChange change={row.positionChange} />
      <div className="text-yellow-400">{podiumIcon(row.rank)}</div>
    </div>
  </div>
);

const ordinal = (n: number): string => {
  if (n >= 11 && n <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
};

/** One finished championship: the podium, where you placed, and a way in. */
const ArchiveCard: React.FC<{
  champ: ArchivedChampionship;
  onOpen: (champ: ArchivedChampionship) => void;
}> = ({ champ, onOpen }) => {
  const podium = [champ.champion, champ.secondPlace, champ.thirdPlace];

  return (
    <div
      className="w-full bg-gradient-to-b rounded-2xl p-6 shadow-xl border border-gray-800"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(39, 21, 82, 0.4), #1e1b2e, #000000)",
      }}
    >
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-xl truncate">{champ.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {champ.weekNumber ? `Week ${champ.weekNumber}` : "Past championship"}
            {champ.sponsor && ` • sponsored by ${champ.sponsor}`}
          </p>
        </div>

        <span className="text-xs uppercase tracking-wider text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">
          Ended
        </span>
      </div>

      {podium.every((p) => !p) ? (
        <p className="text-gray-500 text-sm py-2">
          This championship ended with no entries.
        </p>
      ) : (
        <div className="space-y-2">
          {podium.map((place, i) =>
            place ? (
              <div
                key={place.userId || i}
                className="flex justify-between items-center bg-white/5 rounded-xl p-3 border border-white/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-500 font-semibold text-sm w-7 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-white font-semibold flex items-center gap-2 truncate">
                    {place.flag && <span className="shrink-0">{place.flag}</span>}
                    <span className="truncate">{place.username}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[#8b6fed] font-semibold text-sm">
                    {place.score} pts
                  </span>
                  <div className="text-yellow-400">{podiumIcon(i + 1)}</div>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Where you landed. Omitted entirely rather than shown as a zero when you
          did not enter — a rank of 0 reads as a bug. */}
      {champ.you && champ.you.rank > 0 && (
        <p className="text-sm text-gray-400 mt-3">
          You finished{" "}
          <span className="text-[#8b6fed] font-semibold">
            {ordinal(champ.you.rank)}
          </span>{" "}
          of {champ.participantCount} • {champ.you.points} pts •{" "}
          {champ.you.races} races
        </p>
      )}

      <button
        onClick={() => onOpen(champ)}
        className="text-sm text-[#8b6fed] hover:text-[#a78bfa] transition mt-4"
      >
        View full standings →
      </button>
    </div>
  );
};

/** Final standings for one archived championship, fetched on open. */
const FullStandingsModal: React.FC<{
  champ: ArchivedChampionship;
  userId?: string;
  onClose: () => void;
  onSelectPlayer: (row: Standing) => void;
}> = ({ champ, userId, onClose, onSelectPlayer }) => {
  const [rows, setRows] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/championship/${champ.championshipId}`
        );
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data.standings) ? data.standings : []);
      } catch (err) {
        console.error("Failed to load championship standings:", err);
        if (!cancelled) setError("Could not load these standings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Guards against a state write after the modal is closed mid-request.
    return () => {
      cancelled = true;
    };
  }, [champ.championshipId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c1c22] rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col">
        <header className="flex justify-between items-start gap-3 p-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{champ.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Final standings
              {champ.weekNumber ? ` • Week ${champ.weekNumber}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition shrink-0"
          >
            <X size={24} />
          </button>
        </header>

        <div className="p-4 overflow-y-auto space-y-3">
          {loading ? (
            <p className="text-gray-400 text-center py-6">Loading standings...</p>
          ) : error ? (
            <p className="text-red-400 text-center py-6">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-gray-400 text-center py-6">
              No one entered this championship.
            </p>
          ) : (
            rows.map((row) => (
              <StandingRow
                key={row.userId || `${row.username}-${row.rank}`}
                row={row}
                highlight={!!userId && row.userId === userId}
                onSelect={onSelectPlayer}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const ChampionshipStandings: React.FC<Props> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [championship, setChampionship] = useState<Championship | null>(null);
  const [rows, setRows] = useState<Standing[]>([]);
  const [player, setPlayer] = useState<Standing | null>(null);
  const [total, setTotal] = useState(0);
  const [nextUp, setNextUp] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState<Standing | null>(null);
  const [archive, setArchive] = useState<ArchivedChampionship[]>([]);
  const [openArchive, setOpenArchive] = useState<ArchivedChampionship | null>(null);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (userId) query.set("userId", userId);

      const res = await fetch(
        `${import.meta.env.VITE_PY_SERVER_URL}/api/championship/leaderboard?${query}`
      );
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const data = await res.json();
      setActive(!!data.active);
      setChampionship(data.championship ?? null);
      setRows(Array.isArray(data.entries) ? data.entries : []);
      setPlayer(data.player ?? null);
      setTotal(data.total ?? 0);

      // Only /current knows what is queued behind the scenes, and it is the
      // one thing worth saying when there is nothing running.
      if (!data.active) {
        const currentRes = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/championship/current`
        );
        if (currentRes.ok) {
          const current = await currentRes.json();
          setNextUp(current.nextUp?.name ?? null);
        }
      } else {
        setNextUp(null);
      }
    } catch (error) {
      console.error("Failed to load championship standings:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Standings move whenever anyone finishes a race, so poll rather than showing
  // a table that silently goes stale while the tab is open.
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Finished championships never change, so this is fetched once and left out
  // of the poll above.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ limit: "20" });
        if (userId) query.set("userId", userId);

        const res = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/championship/history?${query}`
        );
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        if (!cancelled) setArchive(Array.isArray(data.history) ? data.history : []);
      } catch (error) {
        // The live standings above are the point of this tab; losing the
        // archive should not take them down with it.
        console.error("Failed to load past championships:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-render the countdown between polls.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);

  if (loading) {
    return (
      <div className="w-full max-w-2xl">
        <p className="text-gray-400 text-center py-10">Loading championship...</p>
      </div>
    );
  }

  // Defined before the early return below so past championships render under
  // the empty state too — they are the only thing worth reading on a tab whose
  // live championship has not started yet.
  const archiveSection = archive.length > 0 && (
    <div className="space-y-4">
      <h3 className="text-gray-400 text-sm font-semibold uppercase tracking-wider px-1">
        Past championships
      </h3>
      {archive.map((c) => (
        <ArchiveCard key={c.championshipId} champ={c} onOpen={setOpenArchive} />
      ))}
    </div>
  );

  const modals = (
    <>
      {openArchive && (
        <FullStandingsModal
          champ={openArchive}
          userId={userId}
          onClose={() => setOpenArchive(null)}
          onSelectPlayer={setOpenProfile}
        />
      )}
      {openProfile && (
        <PlayerProfileModal
          userId={openProfile.userId}
          username={openProfile.username}
          onClose={() => setOpenProfile(null)}
        />
      )}
    </>
  );

  // No championship running — say what is coming rather than looking broken.
  if (!active || !championship) {
    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="relative rounded-2xl p-8 shadow-lg border border-gray-800 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#271552]/60 to-black"></div>

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-[#8b6fed]/15 border border-[#8b6fed]/30 flex items-center justify-center mb-4">
              <Trophy size={26} className="text-[#8b6fed]" />
            </div>

            <h3 className="text-white font-bold text-xl mb-2">Weekly Championship</h3>
            <p className="text-gray-400 text-sm max-w-sm mb-6">
              Every race you enter earns points toward a weekly leaderboard that
              resets each Monday. Champions are archived permanently.
            </p>

            <span className="text-xs uppercase tracking-wider text-[#8b6fed] bg-[#8b6fed]/10 border border-[#8b6fed]/30 px-4 py-1.5 rounded-full">
              {nextUp ? `Next up: ${nextUp}` : "No championship running"}
            </span>

            <p className="text-gray-500 text-xs mt-6">
              Keep racing — points earned now still count toward your all-time
              ranking on the All Races tab.
            </p>
          </div>
        </div>

        {archiveSection}
        {modals}
      </div>
    );
  }

  const remaining = formatRemaining(championship.endDate);
  // Avoid showing the pinned row twice when the player is already visible.
  const playerInList = player && rows.some((r) => r.userId === player.userId);

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div
        className="bg-gradient-to-b via-[#1e1b2e] to-black backdrop-blur-md rounded-2xl p-6 shadow-xl border border-gray-800"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(39, 21, 82, 0.4), #1e1b2e, #000000)",
        }}
      >
        {/* Championship header */}
        <div className="mb-5">
          <div className="flex justify-between items-start gap-3 mb-2">
            <div className="min-w-0">
              <h2 className="text-white font-semibold text-xl truncate">
                {championship.name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {championship.weekNumber ? `Week ${championship.weekNumber}` : "This week"}
                {championship.sponsor && ` • sponsored by ${championship.sponsor}`}
              </p>
            </div>

            {remaining && (
              <span className="text-xs text-[#8b6fed] bg-[#8b6fed]/10 border border-[#8b6fed]/30 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">
                Ends in {remaining}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500">
            {total} {total === 1 ? "player" : "players"} competing • play{" "}
            {championship.dailyBonusRaces} races a day for +
            {championship.dailyBonusPoints} bonus points
          </p>
        </div>

        {/* The player's own standing, pinned so it is visible outside the top 100 */}
        {player && !playerInList && (
          <div className="mb-4">
            <StandingRow row={player} highlight onSelect={setOpenProfile} />
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-gray-400 text-center py-6">
            No races entered yet this week — be the first.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <StandingRow
                key={row.userId || `${row.username}-${row.rank}`}
                row={row}
                highlight={!!userId && row.userId === userId}
                onSelect={setOpenProfile}
              />
            ))}
          </div>
        )}

      </div>

      {archiveSection}
      {modals}
    </div>
  );
};

export default ChampionshipStandings;
