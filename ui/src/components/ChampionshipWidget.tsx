"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { remainingParts } from "../helpers/date/formatRemaining";
import calendar from "../assets/calendar.png";
import contact from "../assets/contact.png";
import cup from "../assets/cup.png";
import crown from "../assets/crown.png";

/** A decorated standings row from /api/championship/current. */
interface Standing {
  rank: number;
  userId: string;
  username: string;
  flag: string;
  weeklyPoints: number;
  currentStreak: number;
}

interface Championship {
  id: string;
  name: string;
  sponsor?: string;
  weekNumber?: number;
  endDate?: number;
  /** Free text set by an admin — "$320 gift card", "PS5", "20 points". */
  prize?: string;
  /** Points actually credited to the champion when the week ends; 0 = manual prize. */
  prizePoints?: number;
}

interface Props {
  /** Jumps to the Winners tab, where the full standings live. */
  onViewAll?: () => void;
}

/**
 * The card shell. Lifted out so the loading, idle and live states are the same
 * card in the dashboard grid — collapsing the slot when no championship is
 * running would leave a visible hole between the two cards beside it.
 */
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative rounded-2xl p-4 shadow border border-gray-800 flex flex-col justify-between overflow-hidden">
    <div className="absolute inset-0 bg-[linear-gradient(to_right,_rgba(69,38,140,0.5)_0%,_rgba(69,38,140,0.5)_20%,_rgba(0,0,0,1)_100%)]"></div>
    <div className="relative z-10">{children}</div>
  </div>
);

const InfoBox: React.FC<{
  icon: string;
  alt: string;
  value: React.ReactNode;
  label: string;
  wide?: boolean;
}> = ({ icon, alt, value, label, wide }) => (
  <div
    className={`bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 flex flex-col items-start text-left ${
      wide ? "col-span-2" : ""
    }`}
  >
    <div className="flex items-center justify-start space-x-2 mb-1 min-w-0 w-full">
      <img src={icon} alt={alt} className="w-5 h-5 object-contain shrink-0" />
      <span className="text-base font-semibold text-white truncate">{value}</span>
    </div>
    <span className="text-gray-400 text-xs ml-6">{label}</span>
  </div>
);

const ChampionshipWidget: React.FC<Props> = ({ onViewAll }) => {
  const [active, setActive] = useState(false);
  const [championship, setChampionship] = useState<Championship | null>(null);
  const [leader, setLeader] = useState<Standing | null>(null);
  const [topTen, setTopTen] = useState<Standing[]>([]);
  const [participants, setParticipants] = useState(0);
  const [nextUp, setNextUp] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/championship/current`
        );
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        setActive(!!data.active);
        setChampionship(data.championship ?? null);
        setLeader(data.leader ?? null);
        setTopTen(Array.isArray(data.topTen) ? data.topTen : []);
        setParticipants(data.participantCount ?? 0);
        setNextUp(data.nextUp?.name ?? null);
      } catch (error) {
        console.error("Failed to load championship widget:", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Keep the countdown moving between polls.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);

  if (!loaded) {
    return (
      <Card>
        <h2 className="text-sm font-semibold mb-1 text-white">Championships</h2>
        <p className="text-xs text-gray-400 mb-3">Loading…</p>
      </Card>
    );
  }

  if (!active || !championship) {
    return (
      <Card>
        <h2 className="text-sm font-semibold mb-1 text-white">Championships</h2>
        <p className="text-xs text-gray-400 mb-3">
          {nextUp ? `Next up: ${nextUp}` : "Currently Unavailable"}
        </p>
        <p className="text-xs text-gray-500">
          Every race earns points toward a weekly leaderboard that resets each
          Monday.
        </p>
      </Card>
    );
  }

  const remaining = remainingParts(championship.endDate);

  // The admin can set free text, a points payout, or both. Falling back to the
  // payout means a prize of "20 points" still shows up when nobody typed a label.
  const prizeText =
    championship.prize?.trim() ||
    (championship.prizePoints ? `${championship.prizePoints} points` : "");

  return (
    <Card>
      {/* Title */}
      <h2 className="text-sm font-semibold mb-1 text-white truncate">
        {championship.name}
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        {championship.weekNumber ? `Week ${championship.weekNumber}` : "This week"}
        {championship.sponsor && ` • sponsored by ${championship.sponsor}`}
      </p>

      {/* Time remaining, participants and the current leader */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <InfoBox
          icon={calendar}
          alt="Calendar Icon"
          value={
            remaining
              ? `${remaining.days}d ${remaining.hours}h ${remaining.minutes}m`
              : "—"
          }
          label="Left"
        />

        <InfoBox
          icon={contact}
          alt="Contact Icon"
          value={participants}
          label="Participants"
        />

        {/* A points prize with no text still deserves a label. */}
        {prizeText && (
          <InfoBox
            icon={cup}
            alt="Trophy Icon"
            value={prizeText}
            label="Prize"
            wide
          />
        )}

        <InfoBox
          icon={crown}
          alt="Crown Icon"
          value={
            leader ? (
              <>
                {leader.flag && <span className="mr-1">{leader.flag}</span>}
                {leader.username}
                <span className="text-[#8b6fed]"> • {leader.weeklyPoints} pts</span>
              </>
            ) : (
              "No entries yet"
            )
          }
          label={leader ? "Current leader" : "Be the first to race this week"}
          wide
        />
      </div>

      {/* Top 10 preview — the leader already has their own box above */}
      {topTen.length > 1 && (
        <div className="flex flex-col mb-2">
          {topTen.slice(1, 10).map((row) => (
            <div
              key={row.userId || `${row.username}-${row.rank}`}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-500 text-xs font-semibold w-4 shrink-0 tabular-nums">
                  {row.rank}
                </span>
                {row.flag && <span className="text-sm shrink-0">{row.flag}</span>}
                <span className="text-gray-300 text-sm truncate">{row.username}</span>
                {!!row.currentStreak && (
                  <span className="text-[10px] text-orange-400 shrink-0">
                    🔥{row.currentStreak}
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm whitespace-nowrap shrink-0 tabular-nums">
                {row.weeklyPoints}
              </span>
            </div>
          ))}
        </div>
      )}

      {onViewAll && (
        <button
          onClick={onViewAll}
          className="w-full text-sm font-semibold text-[#8b6fed] hover:text-[#a78bff] transition flex items-center justify-center gap-1"
        >
          View full standings
          <ChevronRight size={16} />
        </button>
      )}
    </Card>
  );
};

export default ChampionshipWidget;
