import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { playsLeftCopy, type GrowthChallenge, type GrowthPerson, type GrowthSnapshot } from "../../helpers/growth/flags";
import { followPlayer, loadGrowthSnapshot, resetGrowthSnapshotCache, unfollowPlayer, unlockShareDay } from "../../helpers/growth/client";
import { loadSignedInPlayer } from "../../helpers/session/player";

const EMPTY: GrowthSnapshot = {
  playLedger: { enabled: false, playsLeft: null, limit: null, outOfPlays: false },
  invites: { enabled: false, code: null, link: null, inviterName: null },
  challenges: { enabled: false, items: [] },
  friends: { enabled: false, people: [], activeToday: [], followingIds: [] },
  shareDay: { enabled: false, url: null, unlocked: false, mode: null },
};

let cached: GrowthSnapshot = EMPTY;
const listeners = new Set<(snap: GrowthSnapshot) => void>();

function useGrowth(): GrowthSnapshot {
  const [snap, setSnap] = useState<GrowthSnapshot>(cached);

  useEffect(() => {
    listeners.add(setSnap);
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (!serverUrl) return () => listeners.delete(setSnap);
    let cancel = false;
    loadGrowthSnapshot(serverUrl).then((next) => {
      if (cancel) return;
      cached = next;
      listeners.forEach((fn) => fn(next));
    });
    return () => {
      cancel = true;
      listeners.delete(setSnap);
    };
  }, []);

  return snap;
}

function publish(next: GrowthSnapshot) {
  cached = next;
  listeners.forEach((fn) => fn(next));
}

async function reloadGrowth(): Promise<void> {
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (!serverUrl) return;
  resetGrowthSnapshotCache();
  publish(await loadGrowthSnapshot(serverUrl));
}

const card = "bg-[#121212] border border-[#2a2a2a] rounded-2xl p-4 text-white";

function absoluteLink(link: string | null): string {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return link;
  if (typeof window === "undefined") return link;
  return new URL(link, window.location.origin).toString();
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy the link");
  }
}

export function PlaysLeftNote() {
  const snap = useGrowth();
  if (!snap.playLedger.enabled) return null;
  const copy = playsLeftCopy(snap.playLedger.playsLeft, snap.playLedger.limit, snap.playLedger.outOfPlays);
  if (!copy) return null;
  return (
    <p className={`mt-4 text-sm ${snap.playLedger.outOfPlays ? "text-amber-200" : "text-gray-300"}`}>
      {copy}
    </p>
  );
}

function PersonRow({ person }: { person: GrowthPerson }) {
  return (
    <li className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-white">{person.username}</span>
    </li>
  );
}

function ChallengeRow({ item, onWatch }: { item: GrowthChallenge; onWatch: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{item.title}</p>
        <p className="text-xs text-gray-400">{item.detail}</p>
      </div>
      <button
        type="button"
        onClick={() => onWatch(item.id)}
        className="shrink-0 text-xs font-semibold px-3 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        Watch this race
      </button>
    </li>
  );
}

export function InvitePanel() {
  const snap = useGrowth();
  if (!snap.invites.enabled) return null;
  const link = absoluteLink(snap.invites.link);
  return (
    <section className={card}>
      <h3 className="text-base font-semibold mb-1">Invite</h3>
      <p className="text-sm text-gray-400 mb-3">Invite someone to their first race. They pick a ball, same as you.</p>
      {snap.invites.code ? (
        <p className="text-sm text-gray-200 mb-3">
          Code <span className="font-semibold text-white">{snap.invites.code}</span>
        </p>
      ) : (
        <p className="text-sm text-gray-400 mb-3">Your invite code will show here when it is ready.</p>
      )}
      {link && (
        <button
          type="button"
          onClick={() => copyText(link)}
          className="text-sm font-semibold px-4 py-2 rounded-full bg-[#1c1c22] border border-gray-700 hover:border-indigo-400"
        >
          Copy invite link
        </button>
      )}
    </section>
  );
}

export function ChallengeInbox({ onWatchChallenge }: { onWatchChallenge: (id: string) => void }) {
  const snap = useGrowth();
  if (!snap.challenges.enabled) return null;
  return (
    <section className={card}>
      <h3 className="text-base font-semibold mb-1">Challenges</h3>
      <p className="text-sm text-gray-400 mb-2">Open a challenge to watch that on-demand race. Results appear when it finishes.</p>
      {snap.challenges.items.length === 0 ? (
        <p className="text-sm text-gray-500">No open challenges.</p>
      ) : (
        <ul>
          {snap.challenges.items.map((item) => (
            <ChallengeRow key={item.id} item={item} onWatch={onWatchChallenge} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function FriendsPanel() {
  const snap = useGrowth();
  if (!snap.friends.enabled) return null;
  return (
    <section className={card}>
      <h3 className="text-base font-semibold mb-1">Friends</h3>
      {snap.friends.people.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">No friends yet. Follow a player from their profile.</p>
      ) : (
        <ul className="mb-3">
          {snap.friends.people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </ul>
      )}
      {snap.friends.activeToday.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-1">Active today</h4>
          <ul>
            {snap.friends.activeToday.map((person) => (
              <PersonRow key={`today-${person.id}`} person={person} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ShareDayButton() {
  const snap = useGrowth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snap.shareDay.enabled) return null;

  const link = absoluteLink(snap.shareDay.url) || (typeof window !== "undefined" ? window.location.origin : "https://pinballrace.com");

  const finish = async (action: "share" | "copy") => {
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (!serverUrl) return;
    setBusy(true);
    try {
      const result = await unlockShareDay(serverUrl, action, snap.shareDay.mode);
      const record = result && typeof result === "object" ? result as { enabled?: boolean } : null;
      if (record && record.enabled === false) {
        toast.error("Share day is not open.");
        return;
      }
      toast.success(action === "copy" ? "Link copied" : "Share recorded");
      await reloadGrowth();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Pinball Race", text: "Pick a ball and watch the race.", url: link });
        await finish("share");
        return;
      } catch {
        // Player closed the share sheet. Do not unlock.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      toast.error("Could not copy the link");
      return;
    }
    await finish("copy");
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      toast.error("Could not copy the link");
      return;
    }
    await finish("copy");
  };

  return (
    <>
      <section className={card}>
        <h3 className="text-base font-semibold mb-1">Share day</h3>
        <p className="text-sm text-gray-400 mb-3">
          {snap.shareDay.unlocked ? "You already unlocked today's extra play." : "Share once today for an extra play."}
        </p>
        {!snap.shareDay.unlocked && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm font-semibold px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700"
          >
            Share
          </button>
        )}
      </section>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-[#161616] border border-gray-800 rounded-2xl p-5 text-white" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Share today's race</h3>
            <p className="text-sm text-gray-400 mb-4">Share the link, or copy it. That unlocks one extra play. Balls are still 1–15.</p>
            <p className="text-xs text-gray-500 break-all mb-4">{link}</p>
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={onShare} className="flex-1 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 font-semibold disabled:opacity-50">
                Share
              </button>
              <button type="button" disabled={busy} onClick={onCopy} className="flex-1 py-2 rounded-full bg-[#1c1c22] border border-gray-700 font-semibold disabled:opacity-50">
                Copy link
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function GrowthHome({ onWatchChallenge }: { onWatchChallenge: (id: string) => void }) {
  const snap = useGrowth();
  const any = snap.invites.enabled || snap.challenges.enabled || snap.friends.enabled || snap.shareDay.enabled;
  if (!any) return null;
  return (
    <section className="px-4 py-8 bg-[#0a0a0a] border-t border-[#1e1e1e]">
      <div className="max-w-xl mx-auto space-y-4">
        <InvitePanel />
        <ChallengeInbox onWatchChallenge={onWatchChallenge} />
        <FriendsPanel />
        <ShareDayButton />
      </div>
    </section>
  );
}

export function ProfileFriends() {
  const snap = useGrowth();
  if (!snap.friends.enabled && !snap.invites.enabled) return null;
  return (
    <div className="space-y-4 mb-8">
      <FriendsPanel />
      <InvitePanel />
    </div>
  );
}

export function FollowButton({ userId }: { userId: string }) {
  const snap = useGrowth();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!snap.friends.enabled) return;
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (!serverUrl) return;
    let cancel = false;
    loadSignedInPlayer(serverUrl)
      .then((player) => {
        if (!cancel && player?._id) setViewerId(player._id);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [snap.friends.enabled]);

  useEffect(() => {
    setFollowing(snap.friends.followingIds.includes(userId));
  }, [snap.friends.followingIds, userId]);

  if (!snap.friends.enabled || !viewerId || viewerId === userId) return null;

  const onClick = async () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (!serverUrl || busy) return;
    setBusy(true);
    try {
      const result = following ? await unfollowPlayer(serverUrl, userId) : await followPlayer(serverUrl, userId);
      const record = result && typeof result === "object" ? result as { enabled?: boolean } : null;
      if (!result || record?.enabled === false) {
        toast.error("Friends are not open.");
        return;
      }
      setFollowing(!following);
      await reloadGrowth();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
    >
      {following ? "Unfollow" : "Follow"}
    </button>
  );
}
