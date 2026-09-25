import assert from "node:assert/strict";
import {
  FALLBACK_NOTICE,
  FALLBACK_PICKER,
  STORED_PICKER,
  betCardCopy,
  cardFromRecord,
  challengesOnFromParts,
  createChallengeInbox,
  createChallengeLanding,
  inboxFeatureOn,
  inboxFromPayload,
  isLiveQueue,
  isWithinLifetime,
  pickerLine,
  publicCardFromPayload,
  readPlayPlan,
  savePlayPlan,
  startChallengePlay,
  videoOf,
  worldCardCopy,
} from "../src/helpers/growth/challengeInbox.js";

const day = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-25T12:00:00Z");

assert.equal(betCardCopy("Ada", 3), "Beat Ada — finished 3rd.");
assert.equal(worldCardCopy("Ada", 10), "Beat Ada — finished 10th — win a free race.");
for (const face of [betCardCopy("Ada", 3), worldCardCopy("Ada", 10)]) {
  assert.equal(/\bball\b/i.test(face), false);
  assert.equal(/\bpin\b/i.test(face), false);
  assert.equal(/[0-9a-f]{24}/i.test(face), false);
}
assert.equal(betCardCopy("aaaaaaaaaaaaaaaaaaaaaaaa", 3), "");

assert.equal(challengesOnFromParts(null), false);
assert.equal(challengesOnFromParts({}), false);
assert.equal(challengesOnFromParts({ challengeFlag: { enabled: false, flag: "growth_challenges" } }), false);
assert.equal(challengesOnFromParts({ challengeFlag: { enabled: true, flag: "play_ledger" } }), false);
assert.equal(challengesOnFromParts({ challengeFlag: { enabled: true, flag: "growth_challenges" } }), true);
assert.equal(challengesOnFromParts({ playLedger: { enabled: true, flag: "play_ledger", challengesEnabled: true } }), true);
assert.equal(challengesOnFromParts({ challengeFlag: { enabled: true, challengesEnabled: false, flag: "challenges" } }), false);
assert.equal(inboxFeatureOn({ enabled: false, inbox: [{ id: "c1" }] }), false);
assert.equal(inboxFeatureOn({ challengesEnabled: true, inbox: [] }), true);
assert.equal(inboxFeatureOn({ inbox: [] }), false);

const openBet = {
  id: "c1",
  fromUsername: "Ada",
  finishPosition: 3,
  status: "open",
  createdAt: now - day,
  raceId: "6a41272d498a72e306f4f94c",
  ball_id: 4,
};
const cards = inboxFromPayload(
  {
    enabled: true,
    inbox: [
      openBet,
      { id: "old", fromUsername: "Bea", finishPosition: 1, createdAt: now - 8 * day },
      { id: "nope", fromUsername: "Cam", finishPosition: 2, status: "declined", createdAt: now },
      { id: "gone", fromUsername: "Dee", place: "4th", status: "expired", createdAt: now },
      { id: "c1", fromUsername: "Ada", finishPosition: 3, createdAt: now },
      { id: "growth-flag-check", fromUsername: "Nope", finishPosition: 1 },
    ],
  },
  now
);
assert.deepEqual(cards.map((card) => card.id), ["c1"]);
assert.equal(cards[0].copy, "Beat Ada — finished 3rd.");
assert.equal(cards[0].playMode, "stored");
assert.equal(JSON.stringify(cards[0]).includes("6a41272d498a72e306f4f94c"), false);
assert.equal(JSON.stringify(cards[0]).includes("ball"), false);

assert.equal(
  cardFromRecord({ id: "x", fromUsername: "Ada", finishPosition: 2, published: false, createdAt: now }, { now }).playMode,
  "fallback"
);
assert.equal(
  cardFromRecord(
    { id: "x", fromUsername: "Ada", finishPosition: 2, race: { published: false }, createdAt: now },
    { now }
  ).playMode,
  "fallback"
);
assert.equal(cardFromRecord({ id: "x", fromUsername: "Ada", finishPosition: 2, raceStatus: "retired", createdAt: now }, { now }).playMode, "fallback");
assert.equal(isWithinLifetime({ expiresAt: now + 1000 }, now), true);
assert.equal(isWithinLifetime({ expiresAt: now - 1 }, now), false);
assert.equal(isWithinLifetime({ createdAt: now - 7 * day }, now), false);
assert.equal(isWithinLifetime({ createdAt: now - 7 * day + 1000 }, now), true);

const pub = publicCardFromPayload(
  { challenge: { id: "pub1", username: "Ada", finishPosition: "10th", createdAt: now, video_link: "https://example.test/secret" } },
  "pub1",
  now
);
assert.equal(pub.copy, "Beat Ada — finished 10th — win a free race.");
assert.equal(JSON.stringify(pub).includes("secret"), false);
assert.equal(publicCardFromPayload({ enabled: false, fromUsername: "Ada", finishPosition: 1 }, "x", now), null);
assert.equal(publicCardFromPayload({ found: false }, "x", now), null);

assert.equal(isLiveQueue({ message: "No Current Game" }), true);
assert.equal(isLiveQueue({ route: "live-events" }), true);
assert.equal(isLiveQueue({ queue: "live" }), true);
assert.equal(isLiveQueue({ video_link: "https://www.youtube.com/embed/abcdefghijk" }), false);
assert.equal(videoOf({ enabled: false, detail: "No Current Game" }), null);
assert.equal(videoOf({ result: { video_link: "https://admin.pinballrace.com/api/videos/secure-stream?token=abc", user_position: "2", user_points: 5 } }).video_link.includes("secure-stream"), true);

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
  if (String(url).includes("/challenges/") && String(url).endsWith("/play")) {
    return { ok: true, async text() { return JSON.stringify({ detail: "No Current Game", queue: "live" }); } };
  }
  if (String(url).endsWith("/api/games/offline/url")) {
    return {
      ok: true,
      async text() {
        return JSON.stringify({ video_link: "https://admin.pinballrace.com/api/videos/secure-stream?token=ondemand", user_position: "4", user_points: 1 });
      },
    };
  }
  return { ok: false, async text() { return "{}"; } };
};

const fallbackRace = await startChallengePlay({
  challengeId: "c1",
  userId: "me",
  ballId: 4,
  playerBase: "https://pinballrace.com:8080",
  pyBase: "https://admin.pinballrace.com",
  plan: { mode: "stored" },
  fetchImpl,
});
assert.equal(fallbackRace.video_link.includes("ondemand"), true);
assert.equal(calls.some((call) => call.url.endsWith("/play")), true);
assert.equal(calls.some((call) => call.url.endsWith("/api/games/offline/url")), true);
assert.equal(calls.find((call) => call.url.endsWith("/api/games/offline/url")).body.ball_id, 4);
assert.equal(JSON.stringify(calls.find((call) => call.url.endsWith("/api/games/offline/url")).body).includes("race"), false);

calls.length = 0;
let noticed = "";
await startChallengePlay({
  challengeId: "c1",
  userId: "me",
  ballId: 2,
  playerBase: "https://pinballrace.com:8080",
  pyBase: "https://admin.pinballrace.com",
  plan: { mode: "fallback" },
  fetchImpl,
  onNotice(message) {
    noticed = message;
  },
});
assert.equal(calls.some((call) => call.url.endsWith("/play")), false);
assert.equal(noticed, FALLBACK_NOTICE);

calls.length = 0;
const stored = await startChallengePlay({
  challengeId: "c9",
  userId: "me",
  ballId: 1,
  playerBase: "https://pinballrace.com:8080",
  pyBase: "https://admin.pinballrace.com",
  plan: { mode: "stored" },
  fetchImpl: async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      async text() {
        return JSON.stringify({ result: { video_link: "https://admin.pinballrace.com/watch/stored", user_position: "1", user_points: 10 } });
      },
    };
  },
});
assert.equal(stored.video_link.includes("stored"), true);
assert.equal(calls.length, 1);

await assert.rejects(
  () =>
    startChallengePlay({
      challengeId: "c1",
      userId: "me",
      ballId: 1,
      playerBase: "https://pinballrace.com:8080",
      pyBase: "https://admin.pinballrace.com",
      plan: { mode: "stored" },
      fetchImpl: async () => ({ ok: false, status: 403, async text() { return JSON.stringify({ detail: "Daily limit of 5 offline games reached" }); } }),
    }),
  /Daily limit/
);

savePlayPlan({ id: "c1", mode: "fallback" });
assert.equal(readPlayPlan("c1").mode, "fallback");
assert.equal(readPlayPlan("other").mode, "stored");
assert.equal(pickerLine("c1"), FALLBACK_PICKER);
assert.equal(pickerLine(""), STORED_PICKER.replace("This opens that on-demand race.", "Results appear automatically when the race finishes."));

function mount(factory, props, overrides = {}) {
  let hooks = [];
  let view = null;
  let alive = true;
  const pending = [];

  function render() {
    let hookIndex = 0;
    pending.length = 0;
    function useState(init) {
      const index = hookIndex++;
      if (hooks.length <= index) hooks.push({ value: typeof init === "function" ? init() : init });
      const slot = hooks[index];
      const set = (update) => {
        const next = typeof update === "function" ? update(slot.value) : update;
        if (Object.is(next, slot.value)) return;
        slot.value = next;
        queueMicrotask(() => {
          if (!alive) return;
          render();
          runEffects();
        });
      };
      return [slot.value, set];
    }
    function useEffect(fn, deps) {
      const index = hookIndex++;
      const prev = hooks[index];
      const changed = !prev || !prev.deps || !deps || deps.length !== prev.deps.length || deps.some((item, n) => !Object.is(item, prev.deps[n]));
      hooks[index] = { deps, fn, cleanup: prev ? prev.cleanup : null };
      if (changed) {
        const earlier = prev;
        pending.push(() => {
          if (earlier && earlier.cleanup) earlier.cleanup();
          const cleanup = fn();
          if (hooks[index]) hooks[index].cleanup = typeof cleanup === "function" ? cleanup : null;
        });
      }
    }
    const jsx = (type, nodeProps, key) => ({ type, props: nodeProps || {}, key });
    const Comp = factory({ useState, useEffect, jsx, jsxs: jsx, ...overrides });
    view = Comp(props);
  }
  function runEffects() {
    const jobs = pending.splice(0, pending.length);
    for (const job of jobs) job();
  }
  render();
  runEffects();
  return {
    get view() {
      return view;
    },
    async settle() {
      for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    },
    stop() {
      alive = false;
    },
  };
}

function texts(node, found = []) {
  if (node == null || node === false || node === true) return found;
  if (Array.isArray(node)) {
    node.forEach((child) => texts(child, found));
    return found;
  }
  if (typeof node === "string" || typeof node === "number") {
    found.push(String(node));
    return found;
  }
  if (typeof node === "object" && node.props) texts(node.props.children, found);
  return found;
}

function findButton(node, label) {
  if (node == null || node === false) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object" && node.type === "button" && texts(node).join(" ").includes(label)) return node;
  if (typeof node === "object" && node.props) return findButton(node.props.children, label);
  return null;
}

const off = mount(createChallengeInbox, { apiBase: "https://pinballrace.com:8080" }, {
  loadChallengesOpen: async () => false,
  getJson: async () => ({ enabled: false, inbox: [openBet] }),
});
await off.settle();
assert.equal(off.view, null, "Challenges off hides the inbox");
off.stop();

const actions = [];
const played = [];
const on = mount(createChallengeInbox, {
  apiBase: "https://pinballrace.com:8080",
  onPlay(id) {
    played.push(id);
  },
}, {
  loadChallengesOpen: async () => true,
  getJson: async () => ({
    enabled: true,
    inbox: [
      openBet,
      { id: "c2", fromUsername: "Bea", finishPosition: 5, status: "open", createdAt: now, published: false },
    ],
  }),
  postJson: async (url) => {
    actions.push(url);
    return { ok: true };
  },
});
await on.settle();
const shown = texts(on.view).join("\n");
assert.match(shown, /Beat Ada — finished 3rd\./);
assert.match(shown, /Beat Bea — finished 5th\./);
assert.match(shown, /Accept/);
assert.match(shown, /Decline/);
assert.equal(shown.includes("Watch this race"), false);
assert.equal(shown.includes("No Current Game"), false);
assert.equal(shown.includes("live-events"), false);
assert.equal(/\bball\b/i.test(shown), false);
assert.equal(/\bpin\b/i.test(shown), false);
assert.equal(shown.includes("6a41272d498a72e306f4f94c"), false);
assert.equal(shown.includes("Challenge a friend"), false);

findButton(on.view, "Decline").props.onClick();
await on.settle();
assert.equal(actions.some((url) => url.endsWith("/challenges/bets/c1/decline")), true);
assert.equal(texts(on.view).join("\n").includes("Ada"), false);

findButton(on.view, "Accept").props.onClick();
await on.settle();
assert.equal(actions.some((url) => url.endsWith("/challenges/bets/c2/accept")), true);
assert.deepEqual(played, ["c2"]);
assert.equal(readPlayPlan("c2").mode, "fallback");
assert.equal(on.view, null);
on.stop();

const landingOff = mount(createChallengeLanding, {}, {
  useParams: () => ({ id: "pub1" }),
  Link: (type, nodeProps) => ({ type: "a", props: nodeProps || {} }),
  apiBase: "https://pinballrace.com:8080",
  loadChallengesOpen: async () => false,
  getJson: async () => null,
});
await landingOff.settle();
const offText = texts(landingOff.view).join("\n");
assert.match(offText, /This challenge is not open/);
assert.equal(offText.includes("Play"), false);
landingOff.stop();

const landingOn = mount(createChallengeLanding, {}, {
  useParams: () => ({ id: "pub1" }),
  Link: (type, nodeProps) => ({ type: "a", props: nodeProps || {} }),
  apiBase: "https://pinballrace.com:8080",
  loadChallengesOpen: async () => true,
  getJson: async (url) => {
    if (String(url).endsWith("/challenges/pub1")) {
      return { enabled: true, id: "pub1", fromUsername: "Ada", finishPosition: 10, createdAt: now, raceId: "6a41272d498a72e306f4f94c" };
    }
    return null;
  },
});
await landingOn.settle();
const onText = texts(landingOn.view).join("\n");
assert.match(onText, /Beat Ada — finished 10th — win a free race\./);
assert.match(onText, /Play/);
assert.match(onText, /Pick a ball from 1–15/);
assert.equal(onText.includes("6a41272d498a72e306f4f94c"), false);
assert.equal(/\bpin\b/i.test(onText), false);
assert.equal(onText.includes("No Current Game"), false);
const playLink = (() => {
  function walk(node) {
    if (!node || typeof node !== "object") return null;
    if (node.props && node.props.to && String(node.props.children).includes("Play")) return node;
    const kids = node.props ? node.props.children : null;
    const list = Array.isArray(kids) ? kids : kids ? [kids] : [];
    for (const kid of list) {
      const found = walk(kid);
      if (found) return found;
    }
    return null;
  }
  return walk(landingOn.view);
})();
assert.equal(playLink.props.to, "/home?challenge=pub1");
playLink.props.onClick();
assert.equal(readPlayPlan("pub1").mode, "stored");
landingOn.stop();

console.log("challenge inbox tests passed");
