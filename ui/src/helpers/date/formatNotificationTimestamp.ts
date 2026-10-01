/**
 * London calendar label for one notification row.
 *
 * The live list is `createNotificationsBell` in the patched www bundle, not
 * this Vite tree. This module is the source of truth for the later
 * STAMP-www-notification-timestamps splice
 * (`ui/stamps/STAMP-www-notification-timestamps.js`). It does not sort rows,
 * touch read ids, or call the API.
 *
 * Labels use Europe/London calendar dates, not a rolling 24-hour window:
 * `Today`, `Yesterday`, `28 Sep`, or `28 Sep 2025` when the year differs.
 * `createdMs` of 0 or any other invalid value returns null so the row omits
 * the label. No clock time.
 */

const LONDON_TIME_ZONE = "Europe/London";
const MAX_DATE_MS = 8.64e15;
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const notificationTimestampStyle = {
  display: "block",
  fontSize: "11px",
  color: "#6b7280",
  marginTop: "4px",
  lineHeight: 1.3,
  fontWeight: 400,
} as const;

interface LondonYmd {
  year: number;
  month: number;
  day: number;
}

function inDateRange(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS;
}

function londonYmd(ms: number): LondonYmd | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    numberingSystem: "latn",
  }).formatToParts(new Date(ms));

  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number(value) : NaN;
  };

  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function civilDayIndex(ymd: LondonYmd): number {
  return Math.floor(Date.UTC(ymd.year, ymd.month - 1, ymd.day) / 86400000);
}

export function formatNotificationTimestamp(
  createdMs: number | null | undefined,
  nowMs?: number
): string | null {
  if (typeof createdMs !== "number" || !inDateRange(createdMs) || createdMs <= 0) {
    return null;
  }

  const now = nowMs === undefined ? Date.now() : nowMs;
  if (typeof now !== "number" || !inDateRange(now)) return null;

  const eventDay = londonYmd(createdMs);
  const today = londonYmd(now);
  if (!eventDay || !today) return null;

  const delta = civilDayIndex(today) - civilDayIndex(eventDay);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";

  const monthName = SHORT_MONTHS[eventDay.month - 1];
  if (!monthName) return null;

  const label = `${eventDay.day} ${monthName}`;
  if (eventDay.year !== today.year) return `${label} ${eventDay.year}`;
  return label;
}

export function notificationRowTimestampChild<T>(
  jsx: (
    type: "time",
    props: {
      dateTime: string;
      style: typeof notificationTimestampStyle;
      children: string;
    }
  ) => T,
  createdMs: number | null | undefined,
  nowMs?: number
): T | null {
  const label = formatNotificationTimestamp(createdMs, nowMs);
  if (!label || typeof createdMs !== "number") return null;

  let dateTime: string;
  try {
    dateTime = new Date(createdMs).toISOString();
  } catch {
    return null;
  }

  return jsx("time", {
    dateTime,
    style: notificationTimestampStyle,
    children: label,
  });
}
