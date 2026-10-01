/**
 * First-entry popup for the weekly prize race.
 *
 * Shown once per championship id. The race-result flag `newlyEntered` is
 * preferred when the API sends it. If that flag is absent (older api2, or a
 * live race whose finish response never reaches the browser), the fallback is
 * "this player now has exactly one finished race on the live board".
 */

export interface ChampionshipEntrySnapshot {
  id: string;
  name: string;
  startDate?: number | null;
  endDate?: number | null;
  prize?: string;
  sponsor?: string;
}

/** localStorage key — once per championship, not once per race. */
export function championshipEntrySeenKey(championshipId: string): string {
  return `champ-entry-seen:${championshipId}`;
}

export function hasSeenChampionshipEntry(championshipId: string): boolean {
  if (!championshipId || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(championshipEntrySeenKey(championshipId)) === "1";
  } catch {
    return false;
  }
}

export function markChampionshipEntrySeen(championshipId: string): void {
  if (!championshipId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(championshipEntrySeenKey(championshipId), "1");
  } catch {
    /* Storage can be blocked. The popup may show again in this browser. */
  }
}

export function shouldShowChampionshipEntry(opts: {
  championshipId?: string | null;
  /**
   * From the race-result payload.
   * true → show, false → do not show, undefined → API did not say (use fallback).
   */
  newlyEntered?: boolean;
  /** Fallback: races already recorded for this player in the live championship. */
  racesThisChampionship?: number | null;
}): boolean {
  const id = opts.championshipId ?? "";
  if (!id || hasSeenChampionshipEntry(id)) return false;
  if (opts.newlyEntered === true) return true;
  if (opts.newlyEntered === false) return false;
  return opts.racesThisChampionship === 1;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Friendly short date in UTC, e.g. "29 Sep". Empty when the timestamp is missing. */
export function formatChampionshipDate(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "{START_DATE} – {END_DATE}". Either side alone if the other is missing. */
export function formatChampionshipWindow(
  start?: number | null,
  end?: number | null,
): string {
  const a = formatChampionshipDate(start);
  const b = formatChampionshipDate(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

export function trimmedSlot(value?: string | null): string {
  return (value ?? "").trim();
}

export const ENTRY_POPUP_EYEBROW = "You're in — Weekly Championship";

export const ENTRY_POPUP_BODY =
  "Nice one — that race put you on this week's board. Keep racing (live or on-demand) to earn points, grab extra races when you can, climb the standings, and go for the prize.";

export function snapshotFromChampionship(
  champ?: {
    id?: string;
    name?: string | null;
    startDate?: number | null;
    endDate?: number | null;
    prize?: string | null;
    sponsor?: string | null;
  } | null,
): ChampionshipEntrySnapshot | null {
  if (!champ?.id) return null;
  return {
    id: champ.id,
    name: champ.name ?? "",
    startDate: champ.startDate,
    endDate: champ.endDate,
    prize: champ.prize ?? "",
    sponsor: champ.sponsor ?? "",
  };
}
