import assert from "node:assert/strict";
import {
  betCardCopy,
  betRequestBody,
  canSend,
  cardsForFinish,
  challengesEnabledFromBootstrap,
  createPostRaceShareCards,
  ordinal,
  parseFinishPosition,
  parseSocialLists,
  publicRequestBody,
  readPublicCard,
  worldCardCopy,
} from "../src/helpers/growth/shareCards.js";

const places = [];
for (let n = 1; n <= 15; n += 1) places.push(n);

for (const place of places) {
  const cards = cardsForFinish(place);
  assert.equal(cards.bet, place <= 5, `bet ${place}`);
  assert.equal(cards.world, place <= 10, `world ${place}`);
}

for (const hidden of ["10+", "No Entry", "", "16", "0", "Ball 4", null, undefined]) {
  const cards = cardsForFinish(hidden);
  assert.equal(cards.bet, false, `hidden bet ${hidden}`);
  assert.equal(cards.world, false, `hidden world ${hidden}`);
}

assert.equal(parseFinishPosition("1st"), 1);
assert.equal(parseFinishPosition("2nd"), 2);
assert.equal(parseFinishPosition("3rd place"), 3);
assert.equal(parseFinishPosition("11th"), 11);
assert.equal(ordinal(1), "1st");
assert.equal(ordinal(2), "2nd");
assert.equal(ordinal(3), "3rd");
assert.equal(ordinal(11), "11th");
assert.equal(ordinal(12), "12th");
assert.equal(ordinal(13), "13th");

const betFace = betCardCopy("Ada", 3);
const worldFace = worldCardCopy("Ada", 10);
assert.equal(betFace, "Beat Ada — finished 3rd.");
assert.equal(worldFace, "Beat Ada — finished 10th — win a free race.");
for (const face of [betFace, worldFace]) {
  assert.equal(/\bball\b/i.test(face), false);
  assert.equal(/\bpin\b/i.test(face), false);
  assert.equal(/[0-9a-f]{24}/i.test(face), false);
}

assert.deepEqual(betRequestBody({ userId: "me", recipientId: "them", finishPosition: 3, relationship: "following" }), {
  userId: "me",
  recipientId: "them",
  finishPosition: 3,
  relationship: "following",
});
assert.deepEqual(publicRequestBody({ userId: "me", finishPosition: 8 }), {
  userId: "me",
  finishPosition: 8,
});
assert.throws(() => betRequestBody({ userId: "me", recipientId: "them", finishPosition: 1, relationship: "following", ball_id: 4 }));
assert.throws(() => publicRequestBody({ userId: "me", finishPosition: 1, video_link: "https://example.test/v" }));

assert.equal(canSend("following", { following: 0, friends: 0 }, false), true);
assert.equal(canSend("following", { following: 3, friends: 0 }, false), false);
assert.equal(canSend("following", { following: 3, friends: 0 }, true), false);
assert.equal(canSend("following", { following: 4, friends: 0 }, true), false);
assert.equal(canSend("friend", { following: 0, friends: 0 }, false), false);
assert.equal(canSend("friend", { following: 3, friends: 0 }, true), true);
assert.equal(canSend("friend", { following: 0, friends: 4 }, true), true);
assert.equal(canSend("friend", { following: 0, friends: 5 }, true), false);
assert.equal(canSend("friend", { following: 3, friends: 2 }, true), false);
assert.equal(canSend("following", { following: 2, friends: 2 }, true), true);

const social = parseSocialLists(
  {
    following: [
      { id: "a", username: "Ann" },
      { id: "me", username: "Me" },
    ],
    friends: [{ id: "b", username: "Bo" }, { id: "a", username: "Ann" }],
    friendsUnlocked: true,
  },
  "me"
);
assert.deepEqual(social.following.map((person) => person.username), []);
assert.deepEqual(social.friends.map((person) => person.username).sort(), ["Ann", "Bo"]);
assert.equal(social.hasFriend, true);
assert.equal(parseSocialLists({ following: [{ id: "a", username: "Ann" }] }, "me").hasFriend, false);
assert.equal(parseSocialLists({ friendsUnlocked: true, following: [{ id: "a", username: "Ann" }] }, "").hasFriend, true);

assert.equal(challengesEnabledFromBootstrap(null), false);
assert.equal(challengesEnabledFromBootstrap({}), false);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { enabled: false, flag: "challenges" } }), false);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { enabled: true, flag: "challenges" } }), true);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { challengesEnabled: true } }), true);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { flag: "play_ledger", enabled: true } }), false);
assert.equal(
  challengesEnabledFromBootstrap({ playLedger: { flag: "play_ledger", enabled: false, challengesEnabled: true } }),
  true
);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { enabled: true, challengesEnabled: false, flag: "challenges" } }), false);
assert.equal(challengesEnabledFromBootstrap({ challengeFlag: { enabled: false, challengesEnabled: true, flag: "challenges" } }), true);

const card = readPublicCard({ challenge: { _id: { $oid: "abc123" } } }, "https://pinballrace.com");
assert.equal(card.url, "https://pinballrace.com/c/abc123");
assert.equal(readPublicCard({ url: "/c/ready" }, "https://pinballrace.com").url, "https://pinballrace.com/c/ready");
assert.equal(readPublicCard({}, "https://pinballrace.com"), null);

function mount(props, overrides = {}) {
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
    const Comp = createPostRaceShareCards({
      useState,
      useEffect,
      jsx,
      jsxs: jsx,
      pageOrigin: () => "https://pinballrace.com",
      ...overrides,
    });
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
      for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
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
  if (typeof node === "object") {
    if (node.props) texts(node.props.children, found);
  }
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

const off = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: "1" },
  { loadChallengesEnabled: async () => false, readUsername: async () => "Ada" }
);
assert.equal(off.view, null);
await off.settle();
assert.equal(off.view, null, "Challenges off stays empty");
off.stop();

const first = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: "1st" },
  { loadChallengesEnabled: async () => true }
);
assert.equal(first.view, null, "hidden until the flag resolves");
await first.settle();
const firstText = texts(first.view).join("\n");
assert.match(firstText, /Challenge a friend/);
assert.match(firstText, /Share this race/);
assert.match(firstText, /Beat my finish/);
assert.match(firstText, /Share to the world/);
assert.equal(/\bball\b/i.test(firstText), false);
assert.equal(/\bpin\b/i.test(firstText), false);
first.stop();

const sixth = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: "6" },
  { loadChallengesEnabled: async () => true }
);
await sixth.settle();
const sixthText = texts(sixth.view).join("\n");
assert.equal(sixthText.includes("Challenge a friend"), false);
assert.match(sixthText, /Share this race/);
sixth.stop();

const eleventh = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: "11" },
  { loadChallengesEnabled: async () => true }
);
await eleventh.settle();
assert.equal(eleventh.view, null);
eleventh.stop();

const outside = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: "10+" },
  { loadChallengesEnabled: async () => true }
);
await outside.settle();
assert.equal(outside.view, null);
outside.stop();

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).endsWith("/friends")) {
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          following: [{ id: "ann", username: "Ann" }],
          friends: [{ id: "bo", username: "Bo" }],
        });
      },
    };
  }
  if (String(url).endsWith("/challenges/public")) {
    return {
      ok: true,
      async text() {
        return JSON.stringify({ id: "card1" });
      },
    };
  }
  if (String(url).endsWith("/challenges/bets")) {
    return {
      ok: true,
      async text() {
        return JSON.stringify({ ok: true });
      },
    };
  }
  return { ok: false, async text() { return "no"; } };
};

const played = mount(
  { apiBase: "https://pinballrace.com:8080", userId: "me", username: "Ada", position: 2 },
  { loadChallengesEnabled: async () => true }
);
await played.settle();
findButton(played.view, "Challenge a friend").props.onClick();
await played.settle();
const picker = texts(played.view).join("\n");
assert.match(picker, /Ann/);
assert.match(picker, /Bo/);
assert.match(picker, /Beat Ada — finished 2nd\./);
assert.equal(picker.includes("ball"), false);

findButton(played.view, "Ann").props.onClick();
await played.settle();
const betCall = calls.find((call) => call.url.endsWith("/challenges/bets"));
const betBody = JSON.parse(betCall.options.body);
assert.deepEqual(betBody, {
  userId: "me",
  recipientId: "ann",
  finishPosition: 2,
  relationship: "following",
});
assert.equal(JSON.stringify(betBody).includes("ball"), false);

findButton(played.view, "Share this race").props.onClick();
await played.settle();
const worldCall = calls.find((call) => call.url.endsWith("/challenges/public"));
const worldBody = JSON.parse(worldCall.options.body);
assert.deepEqual(worldBody, { userId: "me", finishPosition: 2 });
const after = texts(played.view).join("\n");
assert.match(after, /Beat Ada — finished 2nd — win a free race\./);
assert.match(after, /https:\/\/pinballrace.com\/c\/card1/);
assert.equal(/\bball\b/i.test(after), false);
assert.equal(after.includes("card1") && after.includes("finished"), true);
played.stop();
globalThis.fetch = originalFetch;

console.log("share card tests passed");
