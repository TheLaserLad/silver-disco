/**
 * Days/hours/minutes until `endDate` (epoch ms), or null when there is no end.
 *
 * Derived from the timestamp rather than a server-supplied countdown, so a page
 * left open does not drift — callers re-render on a timer and get a fresh value
 * without refetching.
 */
export interface RemainingParts {
  days: number;
  hours: number;
  minutes: number;
}

/** Same clock as formatRemaining, split up for callers that render each unit. */
export function remainingParts(endDate?: number): RemainingParts | null {
  if (!endDate) return null;

  const minutes = Math.max(0, Math.floor((endDate - Date.now()) / 60000));
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  };
}

export default function formatRemaining(endDate?: number): string | null {
  if (!endDate) return null;

  const ms = endDate - Date.now();
  if (ms <= 0) return "ending now";

  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  return `${days}d ${hours}h ${mins}m`;
}
