import React, { useState, useEffect, useRef } from "react";
import { X, Play, Trophy, MapPin } from "lucide-react";
import { toast } from "react-toastify";

// Import images (keeping your existing imports)
import Ball1 from "../assets/balls/1.png";
import Ball2 from "../assets/balls/2.png";
import Ball3 from "../assets/balls/3.png";
import Ball4 from "../assets/balls/4.png";
import Ball5 from "../assets/balls/5.png";
import Ball6 from "../assets/balls/6.png";
import Ball7 from "../assets/balls/7.png";
import Ball8 from "../assets/balls/8.png";
import Ball9 from "../assets/balls/9.png";
import Ball10 from "../assets/balls/10.png";
import Ball11 from "../assets/balls/11.png";
import Ball12 from "../assets/balls/12.png";
import Ball13 from "../assets/balls/13.png";
import Ball14 from "../assets/balls/14.png";
import Ball15 from "../assets/balls/15.png";

const importedBalls = [
  Ball1, Ball2, Ball3, Ball4, Ball5,
  Ball6, Ball7, Ball8, Ball9, Ball10,
  Ball11, Ball12, Ball13, Ball14, Ball15,
];

const balls = importedBalls.map((img, index) => ({
  id: index + 1,
  img,
}));

interface JoinRaceModalProps {
  onClose: () => void;
}

// Define the structure of the API response.
// Remaining-race fields are optional: the live API only added them alongside
// the existing play response. Older responses still omit them.
interface OfflineGameResult {
  video_link: string;
  user_ball: string;
  user_position: string;
  user_points: number;
  daily_limit?: number;
  played_today?: number;
  races_remaining?: number;
}

type Playback =
  | { kind: "video"; src: string }
  | { kind: "iframe"; src: string; provider: "youtube" | "bunny" | "embed" };

function finiteCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/** The play API returns a signed redirect. The real Bunny or file URL is inside the token. */
function unwrapPlayableUrl(videoLink: string): string {
  try {
    const url = new URL(videoLink);
    const token = url.searchParams.get("token");
    const wrapped = Boolean(token) && (url.pathname.includes("secure-stream") || url.hostname.endsWith("pinballrace.com"));
    if (!wrapped || !token) return videoLink;
    const payload = decodeJwtPayload(token);
    const target = payload?.target_url;
    if (typeof target === "string" && /^https?:\/\//i.test(target)) return target;
  } catch {
    /* keep the original link */
  }
  return videoLink;
}

function youtubeId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[0-9A-Za-z_-]{11}$/.test(id) ? id : null;
    }
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    const fromQuery = url.searchParams.get("v") || "";
    if (/^[0-9A-Za-z_-]{11}$/.test(fromQuery)) return fromQuery;
    const parts = url.pathname.split("/").filter(Boolean);
    const markers = new Set(["embed", "shorts", "live", "v"]);
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (markers.has(parts[i]) && /^[0-9A-Za-z_-]{11}$/.test(parts[i + 1])) return parts[i + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function withParams(raw: string, params: Record<string, string>, forceKeys: string[] = []): string {
  try {
    const url = new URL(raw);
    Object.entries(params).forEach(([key, value]) => {
      if (forceKeys.includes(key) || !url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    const joiner = raw.includes("?") ? "&" : "?";
    const extra = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return `${raw}${joiner}${extra}`;
  }
}

function resolvePlayback(videoLink: string): Playback {
  const target = unwrapPlayableUrl(videoLink);
  const id = youtubeId(target);
  if (id) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return {
      kind: "iframe",
      provider: "youtube",
      src: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&enablejsapi=1&playsinline=1&rel=0&modestbranding=1${origin ? `&origin=${encodeURIComponent(origin)}` : ""}`,
    };
  }
  const path = target.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg)$/.test(path)) return { kind: "video", src: target };
  const bunny = /mediadelivery\.net|bunnycdn\.com|b-cdn\.net/i.test(target);
  return {
    kind: "iframe",
    provider: bunny ? "bunny" : "embed",
    src: withParams(
      target,
      {
        autoplay: bunny ? "true" : "1",
        muted: bunny ? "true" : "1",
        mute: "1",
        preload: "true",
        loop: "false",
        playsinline: "1",
        // A saved mid-video position comes back paused behind Bunny's big Play button.
        rememberPosition: "false",
        rememberSettings: "false",
      },
      ["rememberPosition", "rememberSettings"]
    ),
  };
}

function postToPlayer(frame: HTMLIFrameElement | null) {
  const win = frame?.contentWindow;
  if (!win) return;
  const send = (payload: object) => {
    try {
      win.postMessage(JSON.stringify(payload), "*");
    } catch {
      /* player not ready */
    }
  };
  send({ event: "listening", id: "ondemand-race", channel: "widget" });
  send({ event: "command", func: "playVideo", args: [] });
  send({ event: "command", func: "unMute", args: [] });
  send({ context: "player.js", version: "0.0.11", method: "play" });
  send({ context: "player.js", version: "0.0.11", method: "unmute" });
  send({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "ended" });
  send({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "play" });
  send({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "pause" });
  send({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "ready" });
}

function messageMeansPlaying(data: Record<string, unknown>): boolean {
  if (data.event === "play") return true;
  if (data.event === "onStateChange") {
    const info = data.info;
    const state = typeof info === "number" ? info : info && typeof info === "object" ? (info as { playerState?: number }).playerState : undefined;
    return state === 1;
  }
  return false;
}

type Allowance =
  | { kind: "remaining"; left: number }
  | { kind: "cap"; limit: number }
  | { kind: "unknown" };

function allowanceFrom(result: OfflineGameResult | null, landingCap: number | null): Allowance {
  const reported = finiteCount(result?.races_remaining);
  if (reported !== null) return { kind: "remaining", left: reported };
  const played = finiteCount(result?.played_today);
  const limit = finiteCount(result?.daily_limit);
  if (played !== null && limit !== null) return { kind: "remaining", left: Math.max(0, limit - played) };
  const cap = limit ?? (landingCap !== null && landingCap > 0 ? landingCap : null);
  if (cap !== null) return { kind: "cap", limit: cap };
  return { kind: "unknown" };
}

function messageMeansEnded(data: Record<string, unknown>): boolean {
  if (data.event === "ended" || data.event === "finish") return true;
  if (data.context === "player.js" && (data.event === "ended" || data.event === "finish")) return true;
  if (data.event === "onStateChange" || data.event === "infoDelivery") {
    const info = data.info;
    const state = typeof info === "number" ? info : info && typeof info === "object" ? (info as { playerState?: number }).playerState : undefined;
    return state === 0;
  }
  return false;
}

type ModalStep = 'select' | 'video' | 'result';

function racesLeftCopy(
  result: OfflineGameResult | null,
  landingCap: number | null,
  noneLeft: boolean
): { text: string; canPlayNext: boolean } {
  if (noneLeft) return { text: "No on-demand races left today.", canPlayNext: false };
  const allowance = allowanceFrom(result, landingCap);
  if (allowance.kind === "remaining") {
    if (allowance.left <= 0) return { text: "No on-demand races left today.", canPlayNext: false };
    const noun = allowance.left === 1 ? "race" : "races";
    return { text: `${allowance.left} on-demand ${noun} left today.`, canPlayNext: true };
  }
  if (allowance.kind === "cap") {
    return {
      text: `Up to ${allowance.limit.toLocaleString()} on-demand races a day.`,
      canPlayNext: true,
    };
  }
  return { text: "New races available every day.", canPlayNext: true };
}

const RaceAllowance: React.FC<{
  result: OfflineGameResult | null;
  landingCap: number | null;
  noneLeft: boolean;
}> = ({ result, landingCap, noneLeft }) => {
  const copy = racesLeftCopy(result, landingCap, noneLeft);
  return <p className="text-sm text-gray-300 text-center">{copy.text}</p>;
};

const RaceNext: React.FC<{
  result: OfflineGameResult | null;
  landingCap: number | null;
  noneLeft: boolean;
  onPlayNext: () => void;
}> = ({ result, landingCap, noneLeft, onPlayNext }) => {
  const copy = racesLeftCopy(result, landingCap, noneLeft);
  if (!copy.canPlayNext) return null;
  return (
    <button
      onClick={onPlayNext}
      className="w-full py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-lg shadow-indigo-900/50"
    >
      Play the next race
    </button>
  );
};

const JoinRaceModal: React.FC<JoinRaceModalProps> = ({ onClose }) => {
  // UI State
  const [step, setStep] = useState<ModalStep>('select');
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [selectedBall, setSelectedBall] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<OfflineGameResult | null>(null);
  const [dailyCap, setDailyCap] = useState<number | null>(null);
  const [noneLeft, setNoneLeft] = useState(false);
  const [holdPlayback, setHoldPlayback] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const videoOpenedAt = useRef(0);

  // Env vars
  const serverUrl = import.meta.env.VITE_PY_SERVER_URL;
  const serverurl1 = import.meta.env.VITE_SERVER_URL;

  const playback = gameResult?.video_link ? resolvePlayback(gameResult.video_link) : null;

  useEffect(() => {
    const py = import.meta.env.VITE_PY_SERVER_URL;
    if (!py) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${py}/landing`);
        if (!res.ok) return;
        const data = await res.json();
        const cap = finiteCount(data?.max_offline_race);
        if (!cancelled && cap !== null && cap > 0) setDailyCap(cap);
      } catch {
        /* cap is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishRace = () => {
    if (finishedRef.current) return;
    const elapsed = Date.now() - videoOpenedAt.current;
    // Ignore the player's initial "ended/unstarted" burst. A real finish
    // either follows playback or arrives after the race has been on screen.
    if (!startedRef.current && elapsed < 1500) return;
    finishedRef.current = true;
    setStep((current) => (current === "video" ? "result" : current));
  };

  // Start playback as soon as the race video is on screen, then advance when it ends.
  useEffect(() => {
    if (step !== "video" || !playback) return;
    startedRef.current = false;
    finishedRef.current = false;
    videoOpenedAt.current = Date.now();

    const markStarted = () => {
      startedRef.current = true;
      setHoldPlayback(true);
    };
    setHoldPlayback(false);
    let resumeTimer = 0;
    const onMessage = (event: MessageEvent) => {
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!data || typeof data !== "object") return;
      const record = data as Record<string, unknown>;
      if (record.event === "ready") postToPlayer(iframeRef.current);
      if (messageMeansPlaying(record)) markStarted();
      const explicitEnd = record.event === "ended" || record.event === "finish";
      if (explicitEnd || (messageMeansEnded(record) && startedRef.current)) {
        finishRace();
        return;
      }
      // Bunny's large Play button is its own paused-state control. If playback
      // stalls, start it again so the race is not waiting on a tap.
      if (record.event === "pause" && !finishedRef.current) {
        window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(() => {
          if (!finishedRef.current) postToPlayer(iframeRef.current);
        }, 400);
      }
    };
    window.addEventListener("message", onMessage);

    const kick = window.setInterval(() => {
      if (!finishedRef.current) postToPlayer(iframeRef.current);
    }, 700);
    const stopKicking = window.setTimeout(() => window.clearInterval(kick), 8000);
    postToPlayer(iframeRef.current);

    const video = videoRef.current;
    if (video && playback.kind === "video") {
      video.muted = true;
      const attempt = video.play();
      if (attempt) {
        attempt
          .then(() => {
            markStarted();
            video.muted = false;
            return video.play();
          })
          .catch(() => {
            video.muted = true;
            video.play().catch(() => undefined);
          });
      }
    }

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(kick);
      window.clearTimeout(stopKicking);
      window.clearTimeout(resumeTimer);
    };
  }, [step, playback?.src]);

  // 1. Fetch User ID
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${serverurl1}/api/user/me`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data?.user?._id) setUserId(data.user._id);
      } catch (err) {
        console.error("Failed to fetch user:", err);
      }
    };
    fetchUser();
  }, [serverurl1]);

  // 2. Handle Join Logic
  const handleJoin = async () => {
    if (!selectedBall || !userId) return;
    setLoading(true);

    try {
      const res = await fetch(`${serverUrl}/api/games/offline/url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: userId, ball_id: selectedBall }),
      });

      if (!res.ok) {
        let errorDetail = "Failed to join race";
        try {
          const errorBody = await res.json();
          if (errorBody && errorBody.detail) errorDetail = errorBody.detail;
        } catch (e) {
          errorDetail = `Server returned status ${res.status}`;
        }
        if (/daily limit/i.test(errorDetail)) setNoneLeft(true);
        throw new Error(errorDetail);
      }

      const result: OfflineGameResult = await res.json();

      // Store result and switch to video view
      setGameResult(result);
      setNoneLeft(false);
      setStep('video'); 
      
    } catch (err: any) {
      toast.error(err?.message || "Error joining the race");
    } finally {
      setLoading(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderSelectionStep = () => (
    <>
      <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#1a1a1a]">
        <div>
          <h2 className="text-white font-semibold text-lg">Play On-Demand Race</h2>
          <p className="text-gray-400 text-xs">Choose your ball (1–15). Results appear automatically when the race finishes.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition">
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-5 gap-3 justify-items-center bg-[#1f1f1f] p-4">
          {balls.map((ball) => (
            <div
              key={ball.id}
              onClick={() => setSelectedBall(ball.id)}
              className={`rounded-xl overflow-hidden cursor-pointer border-2 transition transform hover:scale-105
                ${selectedBall === ball.id ? "border-indigo-500 shadow-lg shadow-indigo-500/20" : "border-transparent opacity-80 hover:opacity-100"}
              `}
            >
              <img
                src={ball.img}
                alt={`Ball ${ball.id}`}
                className="object-cover w-16 h-16 rounded-lg" // Adjusted slightly for cleaner grid
              />
            </div>
          ))}
        </div>
      </div>

      {noneLeft && (
        <p className="px-4 pt-3 text-sm text-gray-300 bg-[#1a1a1a]">No on-demand races left today.</p>
      )}
      <div className="flex justify-end items-center p-4 border-t border-gray-800 bg-[#1a1a1a] space-x-4">
        <button onClick={onClose} className="text-gray-400 hover:text-white transition text-sm font-medium">
          Cancel
        </button>
        <button
          className={`px-6 py-2 rounded-full font-semibold text-white transition flex items-center gap-2
            ${selectedBall && !noneLeft ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-700 cursor-not-allowed"}
          `}
          disabled={!selectedBall || !userId || loading || noneLeft}
          onClick={handleJoin}
        >
          {loading ? (
            <span className="animate-pulse">Joining...</span>
          ) : (
            <>
              Watch the race <Play size={16} fill="currentColor" />
            </>
          )}
        </button>
      </div>
    </>
  );

const renderVideoStep = () => (
    <div className="fixed inset-x-0 top-0 bottom-20 z-50 bg-black flex flex-col rounded-b-3xl shadow-2xl overflow-hidden">
      
      {/* FIX: Added 'min-h-0' 
         This stops the video from forcing the container to grow 
         and pushing the footer away.
      */}
      <div className="flex-1 min-h-0 relative w-full flex items-center justify-center bg-black">
        {playback?.kind === "video" ? (
          <video
            ref={videoRef}
            src={playback.src}
            autoPlay
            muted
            playsInline
            className={`w-full h-full bg-black${holdPlayback ? " pointer-events-none" : ""}`}
            onPlay={() => {
              startedRef.current = true;
              setHoldPlayback(true);
            }}
            onPause={() => {
              window.setTimeout(() => {
                const video = videoRef.current;
                if (!video || finishedRef.current || video.ended) return;
                video.play().catch(() => undefined);
              }, 400);
            }}
            onEnded={() => finishRace()}
          />
        ) : playback?.kind === "iframe" ? (
          <iframe
            ref={iframeRef}
            src={playback.src}
            title="Race Video"
            className={`w-full h-full${holdPlayback ? " pointer-events-none" : ""}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => postToPlayer(iframeRef.current)}
          />
        ) : (
            <div className="text-white text-xl">Video not available</div>
        )}
      </div>

      {/* Footer stays visible because the video above can shrink. No close or skip. */}
      <div className="flex-none flex items-center p-4 border-t border-gray-800 bg-[#1a1a1a] z-50 h-16">
        <div className="text-gray-400 text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>
            Watching the race
        </div>
      </div>
    </div>
  );

  const renderResultStep = () => (
    <>
      <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#1a1a1a]">
        <h2 className="text-white font-semibold text-lg">Race Results</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition">
          <X size={18} />
        </button>
      </div>

      <div className="p-8 flex flex-col items-center justify-center space-y-6 bg-[#1f1f1f]">
        
        {/* Ball Image */}
        <div className="relative">
             <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-30 rounded-full"></div>
             {selectedBall && (
                 <img 
                    src={balls[selectedBall - 1].img} 
                    alt="My Ball" 
                    className="w-24 h-24 relative z-10 drop-shadow-2xl"
                 />
             )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 w-full mt-4">
            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-700 flex flex-col items-center">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <MapPin size={16} /> <span className="text-xs uppercase tracking-wider">Position</span>
                </div>
                <div className="text-2xl font-bold text-white">
                    {gameResult?.user_position || "-"}
                </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-gray-700 flex flex-col items-center">
                <div className="flex items-center gap-2 text-yellow-500 mb-1">
                    <Trophy size={16} /> <span className="text-xs uppercase tracking-wider text-gray-400">Points</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                    +{gameResult?.user_points || 0}
                </div>
            </div>
        </div>

        <RaceAllowance result={gameResult} landingCap={dailyCap} noneLeft={noneLeft} />

      </div>

      <div className="p-4 border-t border-gray-800 bg-[#1a1a1a] space-y-3">
        <RaceNext
          result={gameResult}
          landingCap={dailyCap}
          noneLeft={noneLeft}
          onPlayNext={() => {
            setGameResult(null);
            setStep("select");
          }}
        />
        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-[#121212] text-white font-semibold border border-gray-700 hover:border-gray-500 transition"
        >
          Close
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 transition-opacity duration-300">
      <div className="bg-[#1a1a1a] w-[90%] sm:w-[420px] rounded-2xl shadow-2xl overflow-hidden border border-gray-800 transition-all duration-300">
        
        {step === 'select' && renderSelectionStep()}
        {step === 'video' && renderVideoStep()}
        {step === 'result' && renderResultStep()}

      </div>
    </div>
  );
};

export default JoinRaceModal;