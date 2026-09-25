import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EMPTY_GROWTH,
  featureEnabled,
  growthSnapshotFromPayloads,
  playsLeftCopy,
  readRaceResult,
  shouldStartChallenge,
} from "./flags.ts";

const here = dirname(fileURLToPath(import.meta.url));

const liveOff = {
  playLedger: null,
  invite: null,
  friends: null,
  suggestions: null,
  shareDay: null,
  challengeFlag: { enabled: false, flag: "growth_challenges", found: false },
};

test("live flag-off challenge payload hides every growth screen", () => {
  const snap = growthSnapshotFromPayloads({
    ...liveOff,
    invite: { enabled: false, flag: "growth_invites" },
  });
  assert.deepEqual(snap, {
    ...EMPTY_GROWTH,
    invites: { ...EMPTY_GROWTH.invites },
    challenges: { enabled: false, items: [] },
  });
  assert.equal(snap.playLedger.enabled, false);
  assert.equal(snap.invites.enabled, false);
  assert.equal(snap.challenges.enabled, false);
  assert.equal(snap.friends.enabled, false);
  assert.equal(snap.shareDay.enabled, false);
  assert.equal(shouldStartChallenge(snap, "abc"), false);
  assert.equal(shouldStartChallenge(snap, null), false);
});

test("missing and non-json payloads stay off", () => {
  assert.equal(featureEnabled(null, "play_ledger"), false);
  assert.equal(featureEnabled("nope", "invites"), false);
  assert.equal(featureEnabled({}, "friends"), false);
  assert.equal(featureEnabled({ enabled: false, flag: "growth_share_day" }, "share_day"), false);
  assert.equal(featureEnabled({ friendsEnabled: false }, "friends"), false);
  const snap = growthSnapshotFromPayloads(liveOff);
  assert.equal(shouldStartChallenge(snap, "abc"), false);
});

test("explicit switches turn on only their own screen", () => {
  const snap = growthSnapshotFromPayloads({
    playLedger: { enabled: true, flag: "growth_play_ledger", playsLeft: 2, dailyPlayLimit: 5 },
    invite: { enabled: true, flag: "growth_invites", code: "ada" },
    friends: { enabled: true, flag: "growth_friends", friends: [{ userId: "u2", username: "bea" }] },
    suggestions: { enabled: true, activeToday: [{ _id: "u3", username: "cam" }] },
    shareDay: { shareDayEnabled: true, url: "https://pinballrace.com/", unlocked: false },
    challengeFlag: {
      enabled: true,
      flag: "growth_challenges",
      found: false,
      inbox: [{ id: "c1", fromUsername: "bea", status: "open" }],
    },
  });
  assert.equal(snap.playLedger.enabled, true);
  assert.equal(snap.playLedger.playsLeft, 2);
  assert.equal(snap.playLedger.outOfPlays, false);
  assert.equal(playsLeftCopy(2, 5, false), "2 of 5 plays left today.");
  assert.equal(snap.invites.code, "ada");
  assert.equal(snap.invites.link, "/r/ada");
  assert.equal(snap.friends.people[0]?.username, "bea");
  assert.equal(snap.friends.activeToday[0]?.username, "cam");
  assert.equal(snap.friends.followingIds.includes("u2"), true);
  assert.equal(snap.shareDay.enabled, true);
  assert.equal(snap.challenges.items[0]?.id, "c1");
  assert.equal(shouldStartChallenge(snap, "c1"), true);
  assert.equal(snap.challenges.items.some((item) => item.id === "growth-flag-check"), false);
});

test("zero plays is the out-of-plays message and does not imply a race", () => {
  const snap = growthSnapshotFromPayloads({
    ...liveOff,
    playLedger: { enabled: true, playsLeft: 0 },
  });
  assert.equal(snap.playLedger.outOfPlays, true);
  assert.equal(playsLeftCopy(0, 5, true), "No plays left today.");
  assert.equal(shouldStartChallenge(snap, "c1"), false);
});

test("a play-ledger on switch does not open challenges or the race", () => {
  const snap = growthSnapshotFromPayloads({
    ...liveOff,
    playLedger: { enabled: true, flag: "growth_play_ledger", playsLeft: 4, dailyPlayLimit: 5 },
    challengeFlag: { enabled: false, flag: "growth_challenges", found: false },
  });
  assert.equal(snap.playLedger.enabled, true);
  assert.equal(snap.challenges.enabled, false);
  assert.equal(shouldStartChallenge(snap, "c1"), false);
});

test("alias false stays hidden even if another feature is on", () => {
  assert.equal(featureEnabled({ growth_invites: false, enabled: true }, "invites"), true);
  assert.equal(featureEnabled({ invitesEnabled: false }, "invites"), false);
  const snap = growthSnapshotFromPayloads({
    ...liveOff,
    playLedger: { playLedgerEnabled: false, playsLeft: 4 },
    challengeFlag: { enabled: false, found: false, inbox: [{ id: "c1" }] },
  });
  assert.equal(snap.playLedger.enabled, false);
  assert.equal(snap.playLedger.playsLeft, null);
  assert.equal(snap.challenges.items.length, 0);
});

test("challenge play response becomes a race only when a video link is present", () => {
  assert.equal(readRaceResult({ enabled: false, flag: "growth_challenges" }), null);
  assert.equal(readRaceResult({ found: false }), null);
  const race = readRaceResult({
    enabled: true,
    result: { video_link: "https://video.example/race", user_ball: "4", user_position: "2", user_points: 8 },
  });
  assert.equal(race?.video_link, "https://video.example/race");
  assert.equal(race?.user_points, 8);
});

test("flags-off path keeps the on-demand watching screen", () => {
  const modal = readFileSync(join(here, "../../components/JoinRaceModaloffline.tsx"), "utf8");
  const home = readFileSync(join(here, "../../pages/home/sections/View.tsx"), "utf8");
  assert.match(modal, /Watching the race/);
  assert.doesNotMatch(modal, /SkipForward/);
  assert.doesNotMatch(modal, /canSkipVideo/);
  assert.match(modal, /\/api\/games\/offline\/url/);
  assert.match(home, /Play On-Demand Race/);
  assert.match(home, /setIsRaceModalOpen\(true\)/);
  assert.doesNotMatch(home, /bg-white/);
});
