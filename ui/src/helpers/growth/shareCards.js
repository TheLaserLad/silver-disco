/**
 * Post-race Card 1 (friend bet) and Card 2 (world share).
 * Card face is username + finish place only. Never a ball number. Never a race or video id.
 * Players pick balls 1–15. This file does not turn any growth flag on.
 */

const CHALLENGE_KEYS = [
  "challengesEnabled",
  "growth_challenges",
  "growthChallenges",
  "challenges",
];

const FLAG_KEYS = {
  challenges: CHALLENGE_KEYS,
};

const FOLLOWING_CAP = 3;
const TOTAL_CAP_BEFORE_FRIEND = 3;
const TOTAL_CAP_WITH_FRIEND = 5;

export function parseFinishPosition(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 1 && value <= 15 ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.includes("+")) return null;
  const match = text.match(/^(\d+)(?:st|nd|rd|th)?(?:\s+place)?$/i);
  if (!match) return null;
  const place = Number(match[1]);
  if (!Number.isInteger(place) || place < 1 || place > 15) return null;
  return place;
}

export function cardsForFinish(position) {
  const place = parseFinishPosition(position);
  if (place == null) return { bet: false, world: false, place: null };
  return {
    bet: place <= 5,
    world: place <= 10,
    place,
  };
}

export function ordinal(place) {
  const n = Number(place);
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function betCardCopy(username, position) {
  const place = parseFinishPosition(position);
  const name = cleanName(username);
  if (!name || place == null) return "";
  return `Beat ${name} — finished ${ordinal(place)}.`;
}

export function worldCardCopy(username, position) {
  const place = parseFinishPosition(position);
  const name = cleanName(username);
  if (!name || place == null) return "";
  return `Beat ${name} — finished ${ordinal(place)} — win a free race.`;
}

export function totalCap(hasFriend) {
  return hasFriend ? TOTAL_CAP_WITH_FRIEND : TOTAL_CAP_BEFORE_FRIEND;
}

export function canSend(kind, sent, hasFriend) {
  const following = sent?.following || 0;
  const friends = sent?.friends || 0;
  const total = following + friends;
  if (total >= totalCap(!!hasFriend)) return false;
  if (kind === "following") return following < FOLLOWING_CAP;
  if (kind === "friend") return !!hasFriend;
  return false;
}

export function capSummary(hasFriend, sent) {
  const used = (sent?.following || 0) + (sent?.friends || 0);
  const left = Math.max(0, totalCap(!!hasFriend) - used);
  const leftLine = left === 1 ? "1 send left for this race." : `${left} sends left for this race.`;
  if (!hasFriend) {
    return `You can challenge up to 3 people you follow. ${leftLine}`;
  }
  return `You can challenge up to 5 people. At most 3 of those can be people you follow. ${leftLine}`;
}

const BANNED_BODY_KEYS = [
  "ball",
  "ball_id",
  "ballId",
  "user_ball",
  "raceId",
  "race_id",
  "video",
  "video_link",
  "videoLink",
  "videoId",
  "video_id",
  "pin",
  "pinId",
];

export function betRequestBody(input) {
  assertCardBody(input);
  const body = {
    userId: input.userId,
    recipientId: input.recipientId,
    finishPosition: input.finishPosition,
    relationship: input.relationship,
  };
  assertCardBody(body);
  return body;
}

export function publicRequestBody(input) {
  assertCardBody(input);
  const body = { userId: input.userId, finishPosition: input.finishPosition };
  assertCardBody(body);
  return body;
}

export function challengesEnabledFromBootstrap(parts) {
  const bag = parts || {};
  return (
    flagOn(bag.challengeFlag, "challenges") ||
    flagAliasOn(bag.friends, "challenges") ||
    flagAliasOn(bag.playLedger, "challenges") ||
    flagAliasOn(bag.invite, "challenges")
  );
}

export async function getJson(url) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function loadChallengesEnabled(apiBase) {
  const base = String(apiBase || "").replace(/\/$/, "");
  if (!base) return false;
  const [playLedger, invite, friends, challengeFlag] = await Promise.all([
    getJson(`${base}/play_ledger`),
    getJson(`${base}/invite`),
    getJson(`${base}/friends`),
    getJson(`${base}/challenges/growth-flag-check`),
  ]);
  return challengesEnabledFromBootstrap({ playLedger, invite, friends, challengeFlag });
}

export async function postChallenges(url, body) {
  assertCardBody(body);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not create that card.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || !data || typeof data !== "object" || Array.isArray(data)) {
    const msg = data && (data.detail || data.error || data.message);
    throw new Error(typeof msg === "string" && msg.trim() ? msg.trim() : "Could not create that card.");
  }
  if (data.enabled === false || data.challengesEnabled === false) {
    throw new Error("Challenges are not open.");
  }
  return data;
}

export function readPublicCard(body, pageOrigin) {
  const origin = String(pageOrigin || "https://pinballrace.com").replace(/\/$/, "");
  const layers = cardLayers(body);
  for (const layer of layers) {
    const explicit = firstString(layer, ["url", "link", "shareUrl", "share_url", "publicUrl", "public_url"]);
    if (explicit) {
      const url = explicit.startsWith("/") ? `${origin}${explicit}` : explicit;
      return { url, id: readId(layer) };
    }
  }
  for (const layer of layers) {
    const id = readId(layer);
    if (id && id !== "growth-flag-check") {
      return { id, url: `${origin}/c/${encodeURIComponent(id)}` };
    }
  }
  return null;
}

export function parseSocialLists(payload, selfId) {
  const layers = socialLayers(payload);
  const friends = peopleFrom(firstArray(layers, ["friends", "mutualFriends", "mutual", "friendList"]), "friend");
  const following = peopleFrom(firstArray(layers, ["following", "followingList", "follows"]), "following");
  const mixed = peopleFrom(firstArray(layers, ["users", "people", "list"]), null);
  const byId = new Map();
  for (const person of [...following, ...mixed, ...friends]) {
    if (!person.username || sameId(person.id, selfId)) continue;
    const prev = byId.get(person.id);
    if (!prev || person.kind === "friend") byId.set(person.id, person);
  }
  const people = [...byId.values()];
  const hasFriend =
    people.some((person) => person.kind === "friend") ||
    layers.some(
      (layer) =>
        layer.friendsUnlocked === true ||
        layer.hasFriend === true ||
        layer.unlockedFriends === true ||
        layer.firstFriend === true
    );
  return {
    hasFriend,
    friends: people.filter((person) => person.kind === "friend"),
    following: people.filter((person) => person.kind === "following"),
  };
}

export function createPostRaceShareCards(deps) {
  const useState = deps.useState;
  const useEffect = deps.useEffect;
  const jsx = deps.jsx;
  const jsxs = deps.jsxs;
  const loadEnabled = deps.loadChallengesEnabled || loadChallengesEnabled;
  const readUser = deps.readUsername;
  const toast = deps.toast;
  const pageOrigin = deps.pageOrigin || (() => "https://pinballrace.com");

  const buttonClass =
    "w-full py-2 rounded-full bg-[#121212] text-white font-semibold border border-gray-700 hover:border-indigo-400 transition disabled:opacity-50";
  const hintClass = "text-xs text-gray-400 text-center";
  const panelClass = "w-full bg-[#161616] border border-gray-800 rounded-2xl p-4 space-y-3";

  return function PostRaceShareCards(props) {
    const [enabled, setEnabled] = useState(false);
    const [username, setUsername] = useState(props.username || "");
    const [open, setOpen] = useState(null);
    const [social, setSocial] = useState({ friends: [], following: [], hasFriend: false });
    const [socialState, setSocialState] = useState("idle");
    const [sent, setSent] = useState({ following: 0, friends: 0 });
    const [sentIds, setSentIds] = useState([]);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [world, setWorld] = useState(null);

    useEffect(() => {
      let cancel = false;
      const base = String(props.apiBase || "").replace(/\/$/, "");
      if (!base) {
        setEnabled(false);
        return undefined;
      }
      loadEnabled(base)
        .then((on) => {
          if (!cancel) setEnabled(!!on);
        })
        .catch(() => {
          if (!cancel) setEnabled(false);
        });
      return () => {
        cancel = true;
      };
    }, [props.apiBase]);

    useEffect(() => {
      if (props.username) setUsername(props.username);
    }, [props.username]);

    useEffect(() => {
      if (!enabled || username || typeof readUser !== "function") return undefined;
      let cancel = false;
      readUser(props.apiBase)
        .then((name) => {
          if (!cancel && typeof name === "string" && name.trim()) setUsername(name.trim());
        })
        .catch(() => {});
      return () => {
        cancel = true;
      };
    }, [enabled, username, props.apiBase]);

    const cards = cardsForFinish(props.position);
    if (!enabled || (!cards.bet && !cards.world)) return null;

    const base = String(props.apiBase || "").replace(/\/$/, "");
    const name = cleanName(username);
    const betFace = name ? betCardCopy(name, cards.place) : "";
    const worldFace = name ? worldCardCopy(name, cards.place) : "";

    const openBet = () => {
      setError("");
      setOpen("bet");
      if (socialState !== "idle") return;
      setSocialState("loading");
      getJson(`${base}/friends`)
        .then((payload) => {
          setSocial(parseSocialLists(payload, props.userId));
          setSocialState("ready");
        })
        .catch(() => {
          setSocial({ friends: [], following: [], hasFriend: false });
          setSocialState("ready");
        });
    };

    const sendBet = (person) => {
      if (!name) {
        setError("Your name is not on the card yet.");
        return;
      }
      if (!canSend(person.kind, sent, social.hasFriend) || sentIds.includes(person.id)) return;
      setBusyId(person.id);
      setError("");
      postChallenges(
        `${base}/challenges/bets`,
        betRequestBody({
          userId: props.userId,
          recipientId: person.id,
          finishPosition: cards.place,
          relationship: person.kind === "friend" ? "friend" : "following",
        })
      )
        .then(() => {
          setSent((prev) => ({
            following: prev.following + (person.kind === "following" ? 1 : 0),
            friends: prev.friends + (person.kind === "friend" ? 1 : 0),
          }));
          setSentIds((prev) => [...prev, person.id]);
          if (toast && toast.success) toast.success("Challenge sent");
        })
        .catch((err) => {
          const msg = err && err.message ? err.message : "Could not send that challenge.";
          setError(msg);
          if (toast && toast.error) toast.error(msg);
        })
        .finally(() => setBusyId(""));
    };

    const createWorld = () => {
      if (!name) {
        setError("Your name is not on the card yet.");
        return;
      }
      setBusyId("world");
      setError("");
      postChallenges(
        `${base}/challenges/public`,
        publicRequestBody({ userId: props.userId, finishPosition: cards.place })
      )
        .then((data) => {
          const card = readPublicCard(data, pageOrigin());
          if (!card || !card.url) throw new Error("The share link was not created.");
          setWorld({ url: card.url, text: worldFace });
          if (toast && toast.success) toast.success("Share link ready");
        })
        .catch((err) => {
          const msg = err && err.message ? err.message : "Could not create that card.";
          setError(msg);
          if (toast && toast.error) toast.error(msg);
        })
        .finally(() => setBusyId(""));
    };

    const copyLink = () => {
      if (!world || !world.url) return;
      const done = () => {
        if (toast && toast.success) toast.success("Link copied");
      };
      const fail = () => {
        setError("Could not copy the link.");
        if (toast && toast.error) toast.error("Could not copy the link.");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(world.url).then(done).catch(fail);
        return;
      }
      fail();
    };

    const shareLink = () => {
      if (!world) return;
      if (navigator.share) {
        navigator
          .share({ title: "Pinball Race", text: world.text, url: world.url })
          .catch((err) => {
            if (err && err.name === "AbortError") return;
            copyLink();
          });
        return;
      }
      copyLink();
    };

    const personButton = (person) => {
      const already = sentIds.includes(person.id);
      const allowed = canSend(person.kind, sent, social.hasFriend);
      return jsx(
        "li",
        {
          children: jsx("button", {
            type: "button",
            disabled: already || !allowed || busyId === person.id,
            onClick: () => sendBet(person),
            className:
              "w-full text-left px-3 py-2 rounded-xl bg-[#1a1a1a] border border-gray-800 text-sm text-white hover:border-indigo-400 disabled:opacity-50",
            children: already ? `${person.username} · Sent` : person.username,
          }),
        },
        `${person.kind}-${person.id}`
      );
    };

    const listBlock = (title, people) => {
      if (!people.length) return null;
      return jsxs("div", {
        children: [
          jsx("h4", {
            className: "text-xs uppercase tracking-wider text-gray-500 mb-2",
            children: title,
          }),
          jsxs("ul", { className: "space-y-2", children: people.map(personButton) }),
        ],
      });
    };

    return jsxs("div", {
      className: "w-full space-y-3",
      children: [
        cards.bet
          ? jsxs("div", {
              className: "space-y-2",
              children: [
                jsx("button", {
                  type: "button",
                  onClick: openBet,
                  className: `${buttonClass} border-indigo-400`,
                  children: "Challenge a friend",
                }),
                jsx("p", { className: hintClass, children: "Beat my finish. This does not use a play." }),
              ],
            })
          : null,
        cards.world && !world
          ? jsxs("div", {
              className: "space-y-2",
              children: [
                jsx("button", {
                  type: "button",
                  disabled: busyId === "world",
                  onClick: createWorld,
                  className: buttonClass,
                  children: busyId === "world" ? "Creating link…" : "Share this race",
                }),
                jsx("p", {
                  className: hintClass,
                  children: "Share to the world. This does not use a play.",
                }),
              ],
            })
          : null,
        open === "bet"
          ? jsxs("div", {
              className: panelClass,
              children: [
                jsx("p", { className: "text-sm text-white font-semibold text-center", children: betFace || "Your name goes on the card." }),
                jsx("p", { className: hintClass, children: capSummary(social.hasFriend, sent) }),
                socialState === "loading" ? jsx("p", { className: hintClass, children: "Loading people you follow…" }) : null,
                socialState === "ready" && social.friends.length === 0 && social.following.length === 0
                  ? jsx("p", {
                      className: "text-sm text-gray-300",
                      children: "Follow a player from their profile first. You can only challenge people you follow or friends.",
                    })
                  : null,
                listBlock("Following", social.following),
                listBlock("Friends", social.friends),
                jsx("button", {
                  type: "button",
                  onClick: () => setOpen(null),
                  className: "w-full text-sm text-gray-400 hover:text-white py-1",
                  children: "Not now",
                }),
              ],
            })
          : null,
        world
          ? jsxs("div", {
              className: panelClass,
              children: [
                jsx("p", { className: "text-sm text-white font-semibold text-center", children: world.text }),
                jsx("p", { className: "text-xs text-gray-500 break-all text-center", children: world.url }),
                jsxs("div", {
                  className: "flex gap-3",
                  children: [
                    jsx("button", {
                      type: "button",
                      onClick: shareLink,
                      className: "flex-1 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold",
                      children: "Share",
                    }),
                    jsx("button", {
                      type: "button",
                      onClick: copyLink,
                      className: "flex-1 py-2 rounded-full bg-[#1c1c22] border border-gray-700 text-white font-semibold",
                      children: "Copy link",
                    }),
                  ],
                }),
              ],
            })
          : null,
        error ? jsx("p", { className: "text-sm text-amber-200 text-center", children: error }) : null,
      ],
    });
  };
}

function cleanName(username) {
  if (typeof username !== "string") return "";
  return username.replace(/\s+/g, " ").trim();
}

function assertCardBody(body) {
  if (!body || typeof body !== "object") throw new Error("Card request refused.");
  for (const key of Object.keys(body)) {
    if (BANNED_BODY_KEYS.includes(key)) throw new Error("Card request refused.");
  }
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function flagSet(feature) {
  return new Set([feature, `growth_${feature}`, ...(FLAG_KEYS[feature] || [])]);
}

function objectLayers(value) {
  const root = isObj(value) ? value : null;
  if (!root) return [];
  const settings = isObj(root.settings) ? root.settings : null;
  return settings ? [root, settings] : [root];
}

function aliasValue(value, feature) {
  const layers = objectLayers(value);
  if (!layers.length) return null;
  const keys = FLAG_KEYS[feature] || [];
  for (const layer of layers) {
    for (const key of keys) {
      if (layer[key] === false) return false;
    }
  }
  for (const layer of layers) {
    for (const key of keys) {
      if (layer[key] === true) return true;
    }
  }
  return null;
}

function flagOn(value, feature) {
  const root = isObj(value) ? value : null;
  if (!root) return false;
  const flag = typeof root.flag === "string" ? root.flag : "";
  if (flag && !flagSet(feature).has(flag)) return false;
  const alias = aliasValue(root, feature);
  if (alias !== null) return alias;
  if (root.enabled === false) return false;
  return root.enabled === true;
}

function flagAliasOn(value, feature) {
  const root = isObj(value) ? value : null;
  if (!root) return false;
  const accepted = flagSet(feature);
  if (typeof root.flag === "string" && accepted.has(root.flag)) return root.enabled === true;
  return aliasValue(root, feature) === true;
}

function firstString(layer, keys) {
  for (const key of keys) {
    const value = layer[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readId(layer) {
  for (const key of ["id", "_id", "challengeId", "publicId", "cardId"]) {
    const value = layer[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (isObj(value) && typeof value.$oid === "string" && value.$oid.trim()) return value.$oid.trim();
  }
  return null;
}

function cardLayers(body) {
  if (!isObj(body)) return [];
  const layers = [body];
  for (const key of ["card", "challenge", "public", "result", "data"]) {
    if (isObj(body[key])) layers.push(body[key]);
  }
  return layers;
}

function socialLayers(payload) {
  if (!isObj(payload)) return [];
  const layers = [payload];
  for (const key of ["data", "result", "social"]) {
    if (isObj(payload[key])) layers.push(payload[key]);
  }
  if (isObj(payload.friends)) layers.push(payload.friends);
  return layers;
}

function firstArray(layers, keys) {
  for (const layer of layers) {
    for (const key of keys) {
      if (Array.isArray(layer[key])) return layer[key];
    }
  }
  return [];
}

function peopleFrom(list, forceKind) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => toPerson(entry, forceKind)).filter(Boolean);
}

function toPerson(entry, forceKind) {
  if (typeof entry === "string" && entry.trim()) {
    const username = entry.trim();
    if (/^[a-f0-9]{24}$/i.test(username)) return null;
    return { id: username, username, kind: forceKind || "following" };
  }
  if (!isObj(entry)) return null;
  const id =
    firstString(entry, ["userId", "user_id", "_id", "id"]) ||
    (isObj(entry._id) && typeof entry._id.$oid === "string" ? entry._id.$oid.trim() : null);
  const username = firstString(entry, ["username", "name", "displayName"]);
  if (!username) return null;
  const friend =
    forceKind === "friend" ||
    entry.friend === true ||
    entry.isFriend === true ||
    entry.mutual === true ||
    entry.relationship === "friend" ||
    entry.relationship === "friends";
  return { id: id || username, username, kind: friend ? "friend" : forceKind || "following" };
}

function sameId(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a) === String(b);
}
