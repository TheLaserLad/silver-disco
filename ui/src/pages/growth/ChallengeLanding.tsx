import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CHALLENGE_RETURN_KEY, featureEnabled, type GrowthChallenge } from "../../helpers/growth/flags";
import { fetchChallenge } from "../../helpers/growth/client";

function describe(payload: unknown, id: string): GrowthChallenge | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = record.challenge && typeof record.challenge === "object"
    ? record.challenge as Record<string, unknown>
    : record;
  if (nested.found === false && !nested.fromUsername && !nested.challenger) return null;
  const who = typeof nested.fromUsername === "string" ? nested.fromUsername
    : typeof nested.challenger === "string" ? nested.challenger
    : typeof nested.username === "string" ? nested.username
    : "A player";
  const status = typeof nested.status === "string" ? nested.status.replace(/_/g, " ") : "Opens one on-demand race.";
  return { id, title: `Challenge from ${who}`, detail: status };
}

/**
 * /c/:id — looks up one challenge.
 * When the switch is off, or the challenge is missing, this page does not open a race.
 */
const ChallengeLanding = () => {
  const { id = "" } = useParams();
  const [state, setState] = useState<"loading" | "off" | "on">("loading");
  const [challenge, setChallenge] = useState<GrowthChallenge | null>(null);
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

  useEffect(() => {
    const clean = id.trim();
    if (!serverUrl || !clean) {
      setState("off");
      return;
    }
    let cancel = false;
    fetchChallenge(serverUrl, clean).then((payload) => {
      if (cancel) return;
      const on = featureEnabled(payload, "challenges");
      const foundFlag = payload && typeof payload === "object" ? (payload as { found?: boolean }).found : undefined;
      if (!on || foundFlag === false) {
        setState("off");
        return;
      }
      setChallenge(describe(payload, clean));
      setState("on");
    });
    return () => {
      cancel = true;
    };
  }, [id, serverUrl]);

  const remember = () => {
    try {
      sessionStorage.setItem(CHALLENGE_RETURN_KEY, id);
    } catch {
      // Ignore private-mode storage failures. The home page also accepts ?challenge=
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#121212] border border-gray-800 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-purple-300 mb-3">Pinball Race</p>
        {state === "loading" ? (
          <p className="text-gray-400">Checking this challenge…</p>
        ) : state === "off" ? (
          <>
            <h1 className="text-2xl font-bold mb-2">This challenge is not open</h1>
            <p className="text-gray-400 text-sm mb-6">
              Nothing starts from this link. You can still pick a ball and watch an on-demand race from the home page.
            </p>
            <Link
              to="/"
              className="inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Go to Pinball Race
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">{challenge?.title || "Challenge"}</h1>
            <p className="text-gray-400 text-sm mb-6">
              {challenge?.detail} Pick a ball from 1–15, then watch. There is no skip. Results appear when the race finishes.
            </p>
            <Link
              to={`/home?challenge=${encodeURIComponent(id)}`}
              onClick={remember}
              className="inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Watch this race
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default ChallengeLanding;
