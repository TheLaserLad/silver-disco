/**
 * STAMP-www-notification-timestamps
 *
 * Paste the two functions below into `createNotificationsBell` in the current
 * live www bundle (audit copy: assets/index-1484b499.js, marker
 * NOTIFICATIONS_BELL_HOME). Put them after `saveReadIds` and before `buildRows`.
 *
 * Do not ship this by copying ui/dist over Home. The live file is a patched
 * bundle; a full Home overwrite drops every other splice.
 *
 * This file is not imported by the Vite app. Paste the functions only.
 * Leave this header comment out of the bundle.
 *
 * Row markup, inside the text span children, after the subtitle div
 * (`children: row.subtitle`). `jsx` is the helper already in that closure.
 * React maps `dateTime` to the datetime attribute.
 *
 *   children: [
 *     jsx("div", {
 *       style: {
 *         fontWeight: 600,
 *         fontSize: "14px",
 *         lineHeight: 1.35,
 *         color: "#f5f5f5",
 *       },
 *       children: row.title,
 *     }),
 *     jsx("div", {
 *       style: {
 *         fontSize: "12px",
 *         color: "#9ca3af",
 *         marginTop: "4px",
 *         lineHeight: 1.35,
 *       },
 *       children: row.subtitle,
 *     }),
 *     notificationRowTimestampChild(jsx, row.createdMs),
 *   ],
 *
 * Keep buildRows' descending createdMs sort, the purple unread dot, localStorage
 * read ids, row click, and Mark all read. Pass createdMs through unchanged.
 * A null child is already valid in this children array (the badge uses null).
 */

function formatNotificationTimestamp(createdMs, nowMs) {
  const MAX_MS = 8.64e15;
  const MONTHS = [
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
  ];

  function inRange(ms) {
    return typeof ms === "number" && Number.isFinite(ms) && Math.abs(ms) <= MAX_MS;
  }

  function londonYmd(ms) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      numberingSystem: "latn",
    }).formatToParts(new Date(ms));
    const read = (type) => {
      const part = parts.find((item) => item.type === type);
      return part ? Number(part.value) : NaN;
    };
    const year = read("year");
    const month = read("month");
    const day = read("day");
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year: year, month: month, day: day };
  }

  function civilDayIndex(ymd) {
    return Math.floor(Date.UTC(ymd.year, ymd.month - 1, ymd.day) / 86400000);
  }

  if (!inRange(createdMs) || createdMs <= 0) return null;
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (!inRange(now)) return null;

  const eventDay = londonYmd(createdMs);
  const today = londonYmd(now);
  if (!eventDay || !today) return null;

  const delta = civilDayIndex(today) - civilDayIndex(eventDay);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";

  const monthName = MONTHS[eventDay.month - 1];
  if (!monthName) return null;
  const label = eventDay.day + " " + monthName;
  if (eventDay.year !== today.year) return label + " " + eventDay.year;
  return label;
}

function notificationRowTimestampChild(jsx, createdMs, nowMs) {
  const label = formatNotificationTimestamp(createdMs, nowMs);
  if (!label) return null;
  let dateTime;
  try {
    dateTime = new Date(createdMs).toISOString();
  } catch (_err) {
    return null;
  }
  return jsx("time", {
    dateTime: dateTime,
    style: {
      display: "block",
      fontSize: "11px",
      color: "#6b7280",
      marginTop: "4px",
      lineHeight: 1.3,
      fontWeight: 400,
    },
    children: label,
  });
}
