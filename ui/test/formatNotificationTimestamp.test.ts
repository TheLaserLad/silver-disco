import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatNotificationTimestamp,
  notificationRowTimestampChild,
} from "../src/helpers/date/formatNotificationTimestamp.ts";

const stampPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../stamps/STAMP-www-notification-timestamps.js"
);

type FormatFn = (createdMs: unknown, nowMs?: number) => string | null;
type ChildFn = (
  jsx: (type: string, props: Record<string, unknown>) => unknown,
  createdMs: unknown,
  nowMs?: number
) => unknown;

function loadStamp(): { formatNotificationTimestamp: FormatFn; notificationRowTimestampChild: ChildFn } {
  const source = readFileSync(stampPath, "utf8");
  return new Function(
    `${source}\nreturn { formatNotificationTimestamp, notificationRowTimestampChild };`
  )() as { formatNotificationTimestamp: FormatFn; notificationRowTimestampChild: ChildFn };
}

const stamp = loadStamp();

const at = (iso: string) => Date.parse(iso);

const cases: Array<{ name: string; createdMs: unknown; nowMs: number; label: string | null }> = [
  {
    name: "same London calendar date is Today, including early morning",
    createdMs: at("2026-09-30T23:10:00.000Z"),
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: "Today",
  },
  {
    name: "previous London calendar date is Yesterday inside a 24h window",
    createdMs: at("2026-09-30T22:50:00.000Z"),
    nowMs: at("2026-09-30T23:05:00.000Z"),
    label: "Yesterday",
  },
  {
    name: "older same-year date is day and short month without a leading zero",
    createdMs: at("2026-09-28T14:00:00.000Z"),
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: "28 Sep",
  },
  {
    name: "single-digit day has no leading zero",
    createdMs: at("2026-10-03T08:00:00.000Z"),
    nowMs: at("2026-10-05T11:00:00.000Z"),
    label: "3 Oct",
  },
  {
    name: "prior year keeps the year and still uses Sep",
    createdMs: at("2025-09-28T11:00:00.000Z"),
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: "28 Sep 2025",
  },
  {
    name: "1 January same year has no leading zero",
    createdMs: at("2026-01-01T08:00:00.000Z"),
    nowMs: at("2026-03-02T12:00:00.000Z"),
    label: "1 Jan",
  },
  {
    name: "New Year's Eve is Yesterday, not a dated label",
    createdMs: at("2025-12-31T23:40:00.000Z"),
    nowMs: at("2026-01-01T00:20:00.000Z"),
    label: "Yesterday",
  },
  {
    name: "two London days before the new year includes the year",
    createdMs: at("2025-12-30T15:00:00.000Z"),
    nowMs: at("2026-01-01T00:20:00.000Z"),
    label: "30 Dec 2025",
  },
  {
    name: "spring-forward morning stays Today on the London date",
    createdMs: at("2026-03-29T00:30:00.000Z"),
    nowMs: at("2026-03-29T11:00:00.000Z"),
    label: "Today",
  },
  {
    name: "the London day before the spring-forward is Yesterday",
    createdMs: at("2026-03-28T23:00:00.000Z"),
    nowMs: at("2026-03-29T11:00:00.000Z"),
    label: "Yesterday",
  },
  {
    name: "the hour repeated on fall-back is still Today",
    createdMs: at("2026-10-24T23:30:00.000Z"),
    nowMs: at("2026-10-25T12:00:00.000Z"),
    label: "Today",
  },
  {
    name: "the London day before fall-back is Yesterday",
    createdMs: at("2026-10-24T22:00:00.000Z"),
    nowMs: at("2026-10-25T12:00:00.000Z"),
    label: "Yesterday",
  },
  {
    name: "a later calendar day uses the short date",
    createdMs: at("2026-10-03T08:00:00.000Z"),
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: "3 Oct",
  },
  {
    name: "createdMs 0 omits the label",
    createdMs: 0,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "negative timestamps omit the label",
    createdMs: -1,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "NaN omits the label",
    createdMs: Number.NaN,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "Infinity omits the label",
    createdMs: Number.POSITIVE_INFINITY,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "null omits the label",
    createdMs: null,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "undefined omits the label",
    createdMs: undefined,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "ISO strings are not reparsed",
    createdMs: "2026-10-01T11:00:00.000Z",
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: null,
  },
  {
    name: "a tiny positive timestamp stays a real 1970 date",
    createdMs: 1,
    nowMs: at("2026-10-01T11:00:00.000Z"),
    label: "1 Jan 1970",
  },
];

describe("formatNotificationTimestamp", () => {
  for (const sample of cases) {
    test(sample.name, () => {
      assert.equal(
        formatNotificationTimestamp(sample.createdMs as number, sample.nowMs),
        sample.label
      );
      assert.equal(stamp.formatNotificationTimestamp(sample.createdMs, sample.nowMs), sample.label);
    });
  }

  test("labels never include a clock", () => {
    for (const sample of cases) {
      const label = formatNotificationTimestamp(sample.createdMs as number, sample.nowMs);
      if (label) assert.equal(label.includes(":"), false);
    }
  });

  test("an invalid now omits the label", () => {
    const createdMs = at("2026-10-01T11:00:00.000Z");
    assert.equal(formatNotificationTimestamp(createdMs, Number.NaN), null);
    assert.equal(stamp.formatNotificationTimestamp(createdMs, Number.NaN), null);
  });
});

describe("notification row markup", () => {
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });

  test("Today renders a muted time element and does not change the timestamp", () => {
    const createdMs = at("2026-10-01T11:00:00.000Z");
    const nowMs = at("2026-10-01T16:00:00.000Z");
    const child = notificationRowTimestampChild(jsx, createdMs, nowMs);
    const fromStamp = stamp.notificationRowTimestampChild(jsx, createdMs, nowMs);

    assert.deepEqual(child, fromStamp);
    assert.deepEqual(child, {
      type: "time",
      props: {
        dateTime: "2026-10-01T11:00:00.000Z",
        style: {
          display: "block",
          fontSize: "11px",
          color: "#6b7280",
          marginTop: "4px",
          lineHeight: 1.3,
          fontWeight: 400,
        },
        children: "Today",
      },
    });
  });

  test("a missing timestamp produces no element", () => {
    const nowMs = at("2026-10-01T11:00:00.000Z");
    assert.equal(notificationRowTimestampChild(jsx, 0, nowMs), null);
    assert.equal(stamp.notificationRowTimestampChild(jsx, 0, nowMs), null);
    assert.equal(notificationRowTimestampChild(jsx, null, nowMs), null);
  });

  test("labels do not affect newest-first createdMs order", () => {
    const nowMs = at("2026-10-01T11:00:00.000Z");
    const rows = [
      { id: "older", createdMs: at("2026-09-28T14:00:00.000Z") },
      { id: "today", createdMs: at("2026-10-01T08:00:00.000Z") },
      { id: "missing", createdMs: 0 },
      { id: "yesterday", createdMs: at("2026-09-30T22:30:00.000Z") },
    ];
    const sorted = rows.slice().sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));
    assert.deepEqual(
      sorted.map((row) => row.id),
      ["today", "yesterday", "older", "missing"]
    );
    assert.deepEqual(
      sorted.map((row) => formatNotificationTimestamp(row.createdMs, nowMs)),
      ["Today", "Yesterday", "28 Sep", null]
    );
  });
});

describe("stamp notes", () => {
  const source = readFileSync(stampPath, "utf8");

  test("names the live splice and forbids a full Home overwrite", () => {
    assert.match(source, /STAMP-www-notification-timestamps/);
    assert.match(source, /index-1484b499\.js/);
    assert.match(source, /createNotificationsBell/);
    assert.match(source, /ui\/dist/);
    assert.match(source, /notificationRowTimestampChild\(jsx, row\.createdMs\)/);
  });
});
