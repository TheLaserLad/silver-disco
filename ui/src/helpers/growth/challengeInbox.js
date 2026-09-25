/**
 * Challenge inbox and /c/{id} open path.
 * Card face is the sender's username and finish place only.
 * Never a ball number. Never a race or video id. Players pick balls 1–15.
 * Play stays on a published on-demand race. This file does not turn any growth flag on.
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROBE_ID = "growth-flag-check";
const PLAY_PLAN_KEY = "pinballrace.challenge.play";
const memoryPlans = new Map();

const CHALLENGE_KEYS = [
  "challengesEnabled",
  "growth_challenges",
  "growthChallenges",
  "challenges",
];

const CLOSED_STATUS = new Set([
  "declined",
  "decline",
  "accepted",
  "expired",
  "closed",
  "cancelled",
  "canceled",
  "played",
  "complete",
  "completed",
  "rejected",
]);

export const FALLBACK_NOTICE =
  "That race is no longer available. This is another on-demand race.";

export const STORED_PICKER =
  "Choose your ball (1–15). This opens that on-demand race.";

export const FALLBACK_PICKER =
  "That race is no longer available. Pick a ball (1–15) for another on-demand race.";

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

export function inboxFeatureOn(payload) {
  if (Array.isArray(payload)) return inboxFromPayload(payload).length > 0;
  const record = asRecord(payload);
  if (!record) return false;
  if (record.enabled === false || record.challengesEnabled === false) return false;
  if (aliasOn(record)) return true;
  if (record.enabled === true) return true;
  return inboxFromPayload(record).length > 0;
}

export function challengesOnFromParts(parts) {
  const bag = parts || {};
  return (
    challengeFlagOn(asRecord(bag.challengeFlag)) ||
    aliasOn(asRecord(bag.friends)) ||
    aliasOn(asRecord(bag.playLedger)) ||
    aliasOn(asRecord(bag.invite)) ||
    inboxFeatureOn(bag.inbox)
  );
}

export function isWithinLifetime(record, now) {
  const row = asRecord(record);
  if (!row) return false;
  const clock = typeof now === "number" ? now : Date.now();
  const exp = timeMs(firstRaw(row, ["expiresAt", "expires_at", "expiry", "expireAt", "ttl"]));
  if (exp != null) return clock < exp;
  const created = timeMs(firstRaw(row, ["createdAt", "created_at", "sentAt", "sent_at", "openedAt"]));
  if (created != null) return clock < created + TTL_MS;
  return true;
}

export function cardFromRecord(record, options) {
  const row = asRecord(record);
  if (!row) return null;
  const id = readId(row);
  if (!id || id === PROBE_ID) return null;
  const world = options && options.world === true ? true : isWorld(row);
  if (!isOpenStatus(row, world)) return null;
  if (!isWithinLifetime(row, options && options.now)) return null;
  const username = usernameOf(row);
  const place = placeOf(row);
  const copy = world ? worldCardCopy(username, place) : betCardCopy(username, place);
  if (!copy) return null;
  const playMode = raceUnavailable(row) ? "fallback" : "stored";
  return { id, username, place, copy, playMode, world: !!world };
}

export function inboxFromPayload(payload, now) {
  const rows = collectRecords(payload);
  const cards = [];
  const seen = new Set();
  for (const row of rows) {
    const card = cardFromRecord(row, { now, world: false });
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}

export function publicCardFromPayload(payload, id, now) {
  const root = asRecord(payload);
  if (root && (root.enabled === false || root.challengesEnabled === false)) return null;
  if (root && root.found === false && !cardLooksPresent(root)) return null;
  const layers = collectRecords(payload);
  const wanted = id ? String(id) : "";
  for (const row of layers) {
    const card = cardFromRecord(row, { now, world: true });
    if (!card) continue;
    if (wanted && card.id !== wanted) continue;
    return card;
  }
  return null;
}

export function savePlayPlan(plan) {
  const next = {
    id: plan && plan.id ? String(plan.id) : "",
    mode: plan && plan.mode === "fallback" ? "fallback" : "stored",
  };
  if (next.id) memoryPlans.set(next.id, next);
  try {
    sessionStorage.setItem(PLAY_PLAN_KEY, JSON.stringify(next));
  } catch {
    // Private mode can block storage. The in-memory plan still covers this tab.
  }
}

export function readPlayPlan(id) {
  const key = id ? String(id) : "";
  try {
    const raw = sessionStorage.getItem(PLAY_PLAN_KEY);
    const plan = raw ? JSON.parse(raw) : null;
    if (plan && key && String(plan.id) === key) {
      return { id: key, mode: plan.mode === "fallback" ? "fallback" : "stored" };
    }
  } catch {
    // Fall through to the in-memory plan.
  }
  const cached = key ? memoryPlans.get(key) : null;
  if (cached) return { id: key, mode: cached.mode === "fallback" ? "fallback" : "stored" };
  return { id: key, mode: "stored" };
}

export function pickerLine(challengeId) {
  if (!challengeId) return "Choose your ball (1–15). Results appear automatically when the race finishes.";
  return readPlayPlan(challengeId).mode === "fallback" ? FALLBACK_PICKER : STORED_PICKER;
}

export function isLiveQueue(payload) {
  if (payload == null) return false;
  if (typeof payload === "string") return liveText(payload);
  const record = asRecord(payload);
  if (!record) return false;
  if (record.live === true && !firstString(record, ["video_link", "videoLink", "video_url"])) return true;
  if (record.queue === "live" || record.mode === "live" || record.kind === "live") return true;
  const blob = [
    record.message,
    record.detail,
    record.error,
    record.title,
    record.status,
    record.queue,
    record.path,
    record.route,
    record.screen,
  ]
    .map((part) => (typeof part === "string" ? part : ""))
    .join(" ");
  if (liveText(blob)) return true;
  const link = firstString(record, ["video_link", "videoLink", "video_url", "url"]);
  return !!(link && looksLikeLiveUrl(link));
}

export function videoOf(payload) {
  if (isLiveQueue(payload)) return null;
  for (const layer of resultLayers(payload)) {
    if (isLiveQueue(layer)) continue;
    const link = firstString(layer, ["video_link", "videoLink", "video_url"]);
    if (!link || looksLikeLiveUrl(link)) continue;
    const race = {
      video_link: link,
      user_ball: firstString(layer, ["user_ball"]) || "",
      user_position: firstString(layer, ["user_position"]) || "",
      user_points: typeof layer.user_points === "number" ? layer.user_points : 0,
    };
    if (typeof layer.daily_limit === "number") race.daily_limit = layer.daily_limit;
    if (typeof layer.played_today === "number") race.played_today = layer.played_today;
    if (typeof layer.races_remaining === "number") race.races_remaining = layer.races_remaining;
    return race;
  }
  return null;
}

export async function startChallengePlay(input) {
  const fetchImpl = input.fetchImpl || fetch;
  const challengeId = input.challengeId ? String(input.challengeId) : "";
  const playerBase = String(input.playerBase || "").replace(/\/$/, "");
  const pyBase = String(input.pyBase || "").replace(/\/$/, "");
  const plan = input.plan || (challengeId ? readPlayPlan(challengeId) : { mode: "stored" });
  const notice = typeof input.onNotice === "function" ? input.onNotice : null;
  const onDailyLimit = typeof input.onDailyLimit === "function" ? input.onDailyLimit : null;

  const playOnDemand = async () => {
    const res = await fetchImpl(`${pyBase}/api/games/offline/url`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ userId: input.userId, ball_id: input.ballId }),
    });
    const data = await readBody(res);
    if (!res.ok) {
      const msg = messageFrom(data) || "Failed to join race";
      if (isDailyLimit(msg) && onDailyLimit) onDailyLimit();
      throw new Error(safePlayerMessage(msg));
    }
    const race = videoOf(data);
    if (!race) throw new Error("No on-demand race is available right now.");
    return race;
  };

  if (!challengeId) return playOnDemand();

  if (plan.mode !== "fallback") {
    try {
      const res = await fetchImpl(`${playerBase}/challenges/${encodeURIComponent(challengeId)}/play`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ userId: input.userId, ball_id: input.ballId, challengeId }),
      });
      const data = await readBody(res);
      if (!res.ok) {
        const msg = messageFrom(data) || "Failed to join race";
        if (isDailyLimit(msg)) {
          if (onDailyLimit) onDailyLimit();
          throw new Error(safePlayerMessage(msg));
        }
        if (res.status === 401) throw new Error("Sign in to play this challenge.");
      } else {
        const race = videoOf(data);
        if (race) return race;
      }
    } catch (err) {
      if (err && (err.dailyLimit || isDailyLimit(err.message) || /sign in/i.test(err.message || ""))) throw err;
      if (notice) notice(FALLBACK_NOTICE);
      return playOnDemand();
    }
    if (notice) notice(FALLBACK_NOTICE);
    return playOnDemand();
  }

  if (notice) notice(FALLBACK_NOTICE);
  return playOnDemand();
}

export async function loadChallengesOpen(apiBase, get) {
  const base = String(apiBase || "").replace(/\/$/, "");
  if (!base) return false;
  const read = get || getJson;
  const [playLedger, invite, friends, challengeFlag, inbox] = await Promise.all([
    read(`${base}/play_ledger`),
    read(`${base}/invite`),
    read(`${base}/friends`),
    read(`${base}/challenges/growth-flag-check`),
    read(`${base}/challenges/inbox`),
  ]);
  return challengesOnFromParts({ playLedger, invite, friends, challengeFlag, inbox });
}

export function createChallengeInbox(deps) {
  const useState = deps.useState;
  const useEffect = deps.useEffect;
  const jsx = deps.jsx;
  const jsxs = deps.jsxs;
  const loadOpen = deps.loadChallengesOpen || loadChallengesOpen;
  const read = deps.getJson || getJson;
  const write = deps.postJson || postJson;

  return function ChallengeInboxPanel(props) {
    const [enabled, setEnabled] = useState(false);
    const [cards, setCards] = useState([]);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
      let cancel = false;
      const base = String(props.apiBase || "").replace(/\/$/, "");
      if (!base) {
        setEnabled(false);
        setCards([]);
        return undefined;
      }
      Promise.all([loadOpen(base, read), read(`${base}/challenges/inbox`)])
        .then(([open, inbox]) => {
          if (cancel) return;
          const on = !!open || inboxFeatureOn(inbox);
          setEnabled(on);
          setCards(on ? inboxFromPayload(inbox) : []);
        })
        .catch(() => {
          if (!cancel) {
            setEnabled(false);
            setCards([]);
          }
        });
      return () => {
        cancel = true;
      };
    }, [props.apiBase]);

    if (!enabled || cards.length === 0) return null;

    const base = String(props.apiBase || "").replace(/\/$/, "");
    const countLine = cards.length === 1 ? "1 open challenge" : `${cards.length} open challenges`;

    const accept = (card) => {
      setBusy(card.id);
      setError("");
      write(`${base}/challenges/bets/${encodeURIComponent(card.id)}/accept`, {})
        .then((data) => {
          if (data && data.enabled === false) throw new Error("Challenges are not open.");
          const mode = raceUnavailable(data) ? "fallback" : card.playMode;
          savePlayPlan({ id: card.id, mode });
          setCards((prev) => prev.filter((item) => item.id !== card.id));
          if (props.onPlay) props.onPlay(card.id);
        })
        .catch((err) => {
          setError(safePlayerMessage(err && err.message ? err.message : "Could not accept that challenge."));
        })
        .finally(() => setBusy(""));
    };

    const decline = (card) => {
      setBusy(card.id);
      setError("");
      write(`${base}/challenges/bets/${encodeURIComponent(card.id)}/decline`, {})
        .then((data) => {
          if (data && data.enabled === false) throw new Error("Challenges are not open.");
          setCards((prev) => prev.filter((item) => item.id !== card.id));
        })
        .catch((err) => {
          setError(safePlayerMessage(err && err.message ? err.message : "Could not decline that challenge."));
        })
        .finally(() => setBusy(""));
    };

    return jsxs("section", {
      className: "bg-[#121212] border border-[#2a2a2a] rounded-2xl p-4 text-white",
      children: [
        jsx("h3", { className: "text-base font-semibold mb-1", children: "Challenges" }),
        jsx("p", {
          className: "text-sm text-gray-400 mb-3",
          children: `${countLine}. Open for 7 days. Accept to play an on-demand race. Decline to close it.`,
        }),
        jsx("ul", {
          className: "space-y-3",
          children: cards.map((card) =>
            jsxs(
              "li",
              {
                className: "border border-gray-800 rounded-xl p-3 bg-[#1a1a1a]",
                children: [
                  jsx("p", { className: "text-sm text-white font-semibold", children: card.copy }),
                  jsxs("div", {
                    className: "flex gap-2 mt-3",
                    children: [
                      jsx("button", {
                        type: "button",
                        disabled: busy === card.id,
                        onClick: () => accept(card),
                        className:
                          "flex-1 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50",
                        children: "Accept",
                      }),
                      jsx("button", {
                        type: "button",
                        disabled: busy === card.id,
                        onClick: () => decline(card),
                        className:
                          "flex-1 py-2 rounded-full bg-[#1c1c22] border border-gray-700 text-white text-sm font-semibold disabled:opacity-50",
                        children: "Decline",
                      }),
                    ],
                  }),
                ],
              },
              card.id
            )
          ),
        }),
        error ? jsx("p", { className: "text-sm text-amber-200 mt-3", children: error }) : null,
      ],
    });
  };
}

export function createChallengeLanding(deps) {
  const useState = deps.useState;
  const useEffect = deps.useEffect;
  const useParams = deps.useParams;
  const jsx = deps.jsx;
  const jsxs = deps.jsxs;
  const Link = deps.Link;
  const loadOpen = deps.loadChallengesOpen || loadChallengesOpen;
  const read = deps.getJson || getJson;

  return function ChallengeLanding() {
    const params = useParams();
    const id = params && params.id ? String(params.id) : "";
    const [state, setState] = useState("loading");
    const [card, setCard] = useState(null);
    const apiBase = deps.apiBase || "https://pinballrace.com:8080";

    useEffect(() => {
      const clean = id.trim();
      if (!clean || clean === PROBE_ID) {
        setState("off");
        return undefined;
      }
      let cancel = false;
      const base = String(apiBase).replace(/\/$/, "");
      Promise.all([
        loadOpen(base, read),
        read(`${base}/challenges/${encodeURIComponent(clean)}`),
        read(`${base}/challenges/public/${encodeURIComponent(clean)}`),
        read(`${base}/challenges/inbox`),
      ])
        .then(([open, direct, pub, inbox]) => {
          if (cancel) return;
          const found =
            publicCardFromPayload(direct, clean) ||
            publicCardFromPayload(pub, clean) ||
            inboxFromPayload(inbox).find((item) => item.id === clean) ||
            null;
          if (found) {
            setCard(found);
            setState("ready");
            return;
          }
          const on = !!open || inboxFeatureOn(direct) || inboxFeatureOn(pub) || inboxFeatureOn(inbox);
          setCard(null);
          setState(on ? "missing" : "off");
        })
        .catch(() => {
          if (!cancel) setState("off");
        });
      return () => {
        cancel = true;
      };
    }, [id]);

    const remember = () => {
      if (!card) return;
      savePlayPlan({ id: card.id, mode: card.playMode });
      try {
        sessionStorage.setItem("pinballrace.challenge", card.id);
      } catch {
        // The home page also reads ?challenge=
      }
    };

    return jsx("div", {
      className: "min-h-screen bg-black text-white flex items-center justify-center p-6",
      children: jsxs("div", {
        className: "w-full max-w-md bg-[#121212] border border-gray-800 rounded-2xl p-6",
        children: [
          jsx("p", {
            className: "text-xs uppercase tracking-[0.2em] text-purple-300 mb-3",
            children: "Pinball Race",
          }),
          state === "loading"
            ? jsx("p", { className: "text-gray-400", children: "Checking this challenge…" })
            : null,
          state === "off"
            ? jsxs("div", {
                children: [
                  jsx("h1", { className: "text-2xl font-bold mb-2", children: "This challenge is not open" }),
                  jsx("p", {
                    className: "text-gray-400 text-sm mb-6",
                    children: "Nothing starts from this link. You can still pick a ball and watch an on-demand race from the home page.",
                  }),
                  jsx(Link, {
                    to: "/",
                    className:
                      "inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold",
                    children: "Go to Pinball Race",
                  }),
                ],
              })
            : null,
          state === "missing"
            ? jsxs("div", {
                children: [
                  jsx("h1", { className: "text-2xl font-bold mb-2", children: "This challenge is not open" }),
                  jsx("p", {
                    className: "text-gray-400 text-sm mb-6",
                    children: "It has been closed or it has expired. You can still play an on-demand race.",
                  }),
                  jsx(Link, {
                    to: "/home?play=1",
                    className:
                      "inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold",
                    children: "Play an on-demand race",
                  }),
                ],
              })
            : null,
          state === "ready" && card
            ? jsxs("div", {
                children: [
                  jsx("h1", { className: "text-2xl font-bold mb-2", children: card.copy }),
                  jsx("p", {
                    className: "text-gray-400 text-sm mb-6",
                    children:
                      card.playMode === "fallback"
                        ? `${FALLBACK_NOTICE} Pick a ball from 1–15.`
                        : "Pick a ball from 1–15, then watch that on-demand race. Results appear when it finishes.",
                  }),
                  jsx(Link, {
                    to: `/home?challenge=${encodeURIComponent(card.id)}`,
                    onClick: remember,
                    className:
                      "inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold",
                    children: "Play",
                  }),
                ],
              })
            : null,
        ],
      }),
    });
  };
}

export async function getJson(url) {
  try {
    const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    return await readBody(res);
  } catch {
    return null;
  }
}

export async function postJson(url, body) {
  assertActionBody(body);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error("Could not update that challenge.");
  }
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(safePlayerMessage(messageFrom(data) || "Could not update that challenge."));
  }
  if (data && (data.enabled === false || data.challengesEnabled === false)) {
    throw new Error("Challenges are not open.");
  }
  return data;
}

function assertActionBody(body) {
  const row = body && typeof body === "object" ? body : {};
  for (const key of Object.keys(row)) {
    if (/ball|pin|race|video/i.test(key)) throw new Error("Could not update that challenge.");
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function explicitSwitch(record) {
  const settings = asRecord(record.settings);
  const pools = settings ? [record, settings] : [record];
  for (const pool of pools) {
    for (const key of CHALLENGE_KEYS) {
      if (pool[key] === false) return false;
    }
  }
  for (const pool of pools) {
    for (const key of CHALLENGE_KEYS) {
      if (pool[key] === true) return true;
    }
  }
  return null;
}

function challengeFlagOn(record) {
  if (!record) return false;
  const flag = typeof record.flag === "string" ? record.flag : "";
  if (flag && !CHALLENGE_KEYS.includes(flag)) return false;
  const explicit = explicitSwitch(record);
  if (explicit !== null) return explicit;
  if (record.enabled === false) return false;
  return record.enabled === true;
}

function aliasOn(record) {
  if (!record) return false;
  const flag = typeof record.flag === "string" ? record.flag : "";
  if (flag && CHALLENGE_KEYS.includes(flag)) return record.enabled === true;
  return explicitSwitch(record) === true;
}

function firstRaw(record, keys) {
  for (const key of keys) {
    if (record[key] != null && record[key] !== "") return record[key];
  }
  return null;
}

function firstString(record, keys) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function timeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
  }
  return null;
}

function readId(record) {
  for (const key of ["id", "_id", "challengeId", "challenge_id", "publicId", "cardId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (asRecord(value) && typeof value.$oid === "string" && value.$oid.trim()) return value.$oid.trim();
  }
  return "";
}

function cleanName(username) {
  if (typeof username !== "string") return "";
  const name = username.replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (/^[a-f0-9]{24}$/i.test(name)) return "";
  if (/\bball\b/i.test(name) || /\bpin\b/i.test(name)) return "";
  return name;
}

function usernameOf(record) {
  const direct = cleanName(
    firstString(record, ["fromUsername", "senderUsername", "challengerUsername", "challenger", "sender", "from", "username", "by", "name"])
  );
  if (direct) return direct;
  for (const key of ["sender", "fromUser", "challengerUser", "user"]) {
    const nested = asRecord(record[key]);
    if (!nested) continue;
    const name = cleanName(firstString(nested, ["username", "name", "displayName"]));
    if (name) return name;
  }
  return "";
}

function placeOf(record) {
  for (const key of ["finishPosition", "finish_position", "place", "position", "finish"]) {
    const place = parseFinishPosition(record[key]);
    if (place) return place;
  }
  return null;
}

function statusOf(record) {
  const status = firstString(record, ["status", "state"]);
  return status.toLowerCase();
}

function isWorld(record) {
  if (record.public === true || record.world === true) return true;
  const kind = firstString(record, ["kind", "type", "cardType", "card"]).toLowerCase();
  return kind === "public" || kind === "world" || kind === "card2";
}

function isOpenStatus(record, world) {
  const status = statusOf(record);
  if (!status) return true;
  if (world && (status === "accepted" || status === "played")) return true;
  if (CLOSED_STATUS.has(status)) return false;
  if (status.includes("declin") || status.includes("expir")) return false;
  return true;
}

function raceUnavailable(record) {
  const row = asRecord(record);
  if (!row) return false;
  if (row.published === false || row.racePublished === false || row.onDemand === false) return true;
  if (row.retired === true || row.unpublished === true || row.missing === true || row.raceMissing === true) return true;
  const status = firstString(row, ["raceStatus", "race_status", "publishedStatus"]).toLowerCase();
  if (["retired", "unpublished", "missing", "gone", "unavailable"].includes(status)) return true;
  for (const key of ["race", "onDemandRace", "ondemand", "game"]) {
    const nested = asRecord(row[key]);
    if (!nested) continue;
    if (nested.published === false || nested.retired === true || nested.missing === true) return true;
    const nestedStatus = firstString(nested, ["status", "state"]).toLowerCase();
    if (["retired", "unpublished", "missing", "gone", "unavailable"].includes(nestedStatus)) return true;
  }
  return false;
}

function collectRecords(payload) {
  const rows = [];
  if (Array.isArray(payload)) rows.push(...payload);
  const record = asRecord(payload);
  if (!record) return rows.filter((row) => asRecord(row));
  for (const key of ["inbox", "challenges", "openChallenges", "open_challenges", "bets", "items", "notices"]) {
    if (Array.isArray(record[key])) rows.push(...record[key]);
  }
  for (const key of ["challenge", "card", "bet", "public", "result", "data"]) {
    if (asRecord(record[key])) rows.push(record[key]);
  }
  if (readId(record) || usernameOf(record)) rows.push(record);
  return rows.map(asRecord).filter(Boolean);
}

function cardLooksPresent(payload) {
  const record = asRecord(payload);
  if (!record) return false;
  if (record.found === false) return false;
  return !!(usernameOf(record) && placeOf(record));
}

function resultLayers(payload) {
  const record = asRecord(payload);
  if (!record) return [];
  const layers = [record];
  for (const key of ["result", "game", "race", "data"]) {
    if (asRecord(record[key])) layers.push(record[key]);
  }
  return layers;
}

function looksLikeLiveUrl(url) {
  return /live-events|no-current-game|tiktok\.com\/@pinballrace\/live/i.test(url);
}

function liveText(text) {
  const value = String(text || "").toLowerCase();
  return value.includes("no current game") || value.includes("live-events") || value.includes("live events") || value.includes("next live");
}

function messageFrom(data) {
  const record = asRecord(data);
  if (!record) return "";
  return firstString(record, ["detail", "error", "message"]);
}

function isDailyLimit(message) {
  return /daily limit|no plays left|no on-demand races left/i.test(String(message || ""));
}

function safePlayerMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "Could not open that on-demand race.";
  if (/[0-9a-f]{24}/i.test(text) || /\bball\b/i.test(text) || /\bpin\b/i.test(text) || /video/i.test(text)) {
    return "Could not open that on-demand race.";
  }
  return text;
}

async function readBody(res) {
  if (!res) return null;
  try {
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
