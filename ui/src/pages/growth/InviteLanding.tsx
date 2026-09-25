import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { featureEnabled } from "../../helpers/growth/flags";
import { landInvite } from "../../helpers/growth/client";

/**
 * /r/:code — records the invite landing once.
 * When invites are off the player API no-ops and this page does not start a race.
 */
const InviteLanding = () => {
  const { code = "" } = useParams();
  const [state, setState] = useState<"loading" | "off" | "on">("loading");
  const [inviter, setInviter] = useState<string | null>(null);
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

  useEffect(() => {
    const clean = code.trim();
    if (!serverUrl || !clean) {
      setState("off");
      return;
    }
    let cancel = false;
    landInvite(serverUrl, clean).then((payload) => {
      if (cancel) return;
      const on = featureEnabled(payload, "invites");
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
      const name = record && typeof record.inviter === "string" ? record.inviter
        : record && typeof record.fromUsername === "string" ? record.fromUsername
        : record && typeof record.inviterName === "string" ? record.inviterName
        : null;
      setInviter(name);
      setState(on ? "on" : "off");
    });
    return () => {
      cancel = true;
    };
  }, [code, serverUrl]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#121212] border border-gray-800 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-purple-300 mb-3">Pinball Race</p>
        {state === "loading" ? (
          <p className="text-gray-400">Checking this invite…</p>
        ) : state === "off" ? (
          <>
            <h1 className="text-2xl font-bold mb-2">Invite links are turned off</h1>
            <p className="text-gray-400 text-sm mb-6">
              You can still pick a ball and watch an on-demand race from the home page. This link does not start a race.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">You were invited</h1>
            <p className="text-gray-400 text-sm mb-6">
              {inviter ? `${inviter} invited you. ` : ""}
              Create an account, pick a ball from 1–15, and watch your first race. Results appear when the race finishes.
            </p>
          </>
        )}
        <Link
          to="/"
          className="inline-block px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
        >
          Go to Pinball Race
        </Link>
      </div>
    </div>
  );
};

export default InviteLanding;
