"use client";

import React, { useEffect, useRef } from "react";

import {
  ENTRY_POPUP_BODY,
  ENTRY_POPUP_EYEBROW,
  formatChampionshipWindow,
  trimmedSlot,
  type ChampionshipEntrySnapshot,
} from "../helpers/championship/entryNotice";

interface Props {
  championship: ChampionshipEntrySnapshot;
  /** Opens Winners → Competitions (weekly standings). */
  onViewStandings: () => void;
  /** Closes the popup. The player stays where they were. */
  onDismiss: () => void;
}

/**
 * Dark first-entry popup. Slots come from the live championship.
 * Empty prize and sponsor rows are left out entirely.
 */
const ChampionshipEntryModal: React.FC<Props> = ({
  championship,
  onViewStandings,
  onDismiss,
}) => {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    document.addEventListener("keydown", onKey);
    primaryRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const weekName = trimmedSlot(championship.name);
  const dates = formatChampionshipWindow(championship.startDate, championship.endDate);
  const prize = trimmedSlot(championship.prize);
  const sponsor = trimmedSlot(championship.sponsor);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4"
      onClick={() => dismissRef.current()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="champ-entry-title"
        className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#141820] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#e6b325]">
          {ENTRY_POPUP_EYEBROW}
        </p>

        {weekName && (
          <h2
            id="champ-entry-title"
            className="text-white text-[28px] leading-tight font-semibold mt-3"
          >
            {weekName}
          </h2>
        )}
        {!weekName && <h2 id="champ-entry-title" className="sr-only">Weekly Championship</h2>}

        {dates && <p className="text-sm text-gray-300 mt-2">{dates}</p>}

        {prize && (
          <p className="text-sm mt-3">
            <span className="text-gray-400">Prize: </span>
            <span className="text-[#e6b325] font-semibold">{prize}</span>
          </p>
        )}

        {sponsor && (
          <p className={`text-sm text-gray-300 ${prize ? "mt-1" : "mt-3"}`}>
            Sponsored by {sponsor}
          </p>
        )}

        <p className="text-[15px] text-gray-300 leading-relaxed mt-4">
          {ENTRY_POPUP_BODY}
        </p>

        <button
          ref={primaryRef}
          type="button"
          onClick={onViewStandings}
          className="w-full mt-5 rounded-xl bg-[#4C8BF5] hover:bg-[#3d7ae8] text-white font-semibold py-3 transition"
        >
          View standings
        </button>
        <button
          type="button"
          onClick={() => dismissRef.current()}
          className="w-full mt-2 rounded-xl border border-white/15 bg-[#1a1e28] text-gray-300 font-semibold py-3 hover:bg-white/5 transition"
        >
          Keep racing
        </button>
      </div>
    </div>
  );
};

export default ChampionshipEntryModal;
