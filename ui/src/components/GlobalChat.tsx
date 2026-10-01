import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, X } from "lucide-react";
import { toast } from "react-toastify";
import "./GlobalChat.css";

/** Survives a minified splice. Live deploy must find this marker. */
export const GLOBAL_CHAT_MARKER = "GLOBAL_CHAT_V1";

const COPY = {
  bubble: "Chat",
  title: "Chat",
  subtitle: "Global",
  close: "Close",
  placeholder: "Say something…",
  send: "Send",
  empty: "Say hi — keep it friendly.",
  loading: "Loading chat…",
  reconnecting: "Reconnecting…",
  gateTitle: "Sign in to chat",
  gateBody: "Chat is for signed-in players.",
  signIn: "Sign in",
  createAccount: "Create account",
  tooLong: "Keep it under 160 characters.",
  rateLimited: "Slow down a second…",
  blocked: "Message blocked.",
  sendFailed: "Couldn’t send — try again.",
  notSignedIn: "Sign in to chat.",
  links: "Links aren’t allowed in chat.",
  muted: "You’re muted in chat. You can still play.",
  banned: "You’re banned from chat. You can still race.",
  bannedShort: "Chat unavailable.",
  report: "Report",
  confirmTitle: "Report this message?",
  confirmBody: "Race desk will review it.",
  cancel: "Cancel",
  thanks: "Thanks — race desk will review.",
  already: "Already reported.",
  badgeCap: "9+",
  newMessages: "New chat messages",
} as const;

const MAX_LEN = 160;

export type ChatLine = {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
};

export type ChatSanctionView = {
  type: "mute" | "ban";
  expiresAt: string | null;
} | null;

export type GlobalChatPreview = {
  auth: "guest" | "player";
  username?: string;
  userId?: string;
  messages?: ChatLine[];
  sanction?: ChatSanctionView;
  open?: boolean;
  unread?: number;
};

type Props = {
  /** Home tab bar is fixed; keep the bubble above it. Login can sit in the corner. */
  dock?: "above-footer" | "corner";
  /** `stage` pins the bubble inside a relative parent (dev preview only). */
  placement?: "viewport" | "stage";
  preview?: GlobalChatPreview;
};

type Player = { id: string; username: string };

type SendResult = {
  ok?: boolean;
  code?: string;
  message?: string | ChatLine;
  sanction?: ChatSanctionView;
  messages?: ChatLine[];
};

function errorText(message: SendResult["message"]): string {
  return typeof message === "string" && message ? message : COPY.sendFailed;
}

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length < 2) return undefined;
  return parts.pop()?.split(";").shift();
}

function serverBase(): string {
  return String(import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
}

function socketBase(): string {
  return String(import.meta.env.VITE_WS_URL || import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function badgeLabel(count: number): string {
  if (count > 9) return COPY.badgeCap;
  return String(count);
}

function openAuth(mode: "login" | "signup"): void {
  const event = new CustomEvent("pinballrace:open-auth", { detail: mode, cancelable: true });
  const stayed = !window.dispatchEvent(event);
  if (stayed) return;
  window.location.assign(mode === "signup" ? "/signUp" : "/");
}

export default function GlobalChat({ dock = "above-footer", placement = "viewport", preview }: Props) {
  const [player, setPlayer] = useState<Player | null>(
    preview?.auth === "player"
      ? { id: preview.userId || "preview", username: preview.username || "You" }
      : null
  );
  const [authKnown, setAuthKnown] = useState(Boolean(preview));
  const [guest, setGuest] = useState(preview?.auth === "guest");
  const [open, setOpen] = useState(Boolean(preview?.open));
  const [messages, setMessages] = useState<ChatLine[]>(preview?.messages || []);
  const [sanction, setSanction] = useState<ChatSanctionView>(preview?.sanction ?? null);
  const [unread, setUnread] = useState(preview?.unread || 0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingReport, setPendingReport] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<import("socket.io-client").Socket | null>(null);
  const openRef = useRef(open);
  const playerRef = useRef(player);
  const toastedMute = useRef<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set((preview?.messages || []).map((m) => m.id)));

  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    if (preview) return;
    const base = serverBase();
    if (!base) {
      setGuest(true);
      setAuthKnown(true);
      return;
    }
    let cancelled = false;
    fetch(`${base}/api/user/me`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("guest");
        const data = await res.json();
        const user = data.user || data;
        if (!user?._id) throw new Error("guest");
        if (cancelled) return;
        setPlayer({ id: String(user._id), username: user.username || "Player" });
        setGuest(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPlayer(null);
        setGuest(true);
      })
      .finally(() => {
        if (!cancelled) setAuthKnown(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    if (sanction?.type === "mute" && sanction.expiresAt && toastedMute.current !== sanction.expiresAt) {
      toastedMute.current = sanction.expiresAt;
      const when = new Date(sanction.expiresAt).toLocaleString();
      toast(`You’re muted until ${when}.`);
    }
  }, [sanction]);

  function remember(message: ChatLine, countUnread: boolean) {
    if (!message?.id || seenIds.current.has(message.id)) return;
    seenIds.current.add(message.id);
    setMessages((prev) => [...prev, message]);
    const mine = message.userId === playerRef.current?.id;
    if (countUnread && !openRef.current && !mine) {
      setUnread((n) => n + 1);
    }
  }

  useEffect(() => {
    if (preview || guest || !player) return;
    const base = socketBase();
    if (!base) return;
    let disposed = false;
    let socket: import("socket.io-client").Socket | null = null;

    void import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      socket = io(`${base}/chat`, {
        auth: { token: getCookie("token") },
        withCredentials: true,
        forceNew: true,
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      socket.on("connect", () => setReconnecting(false));
      socket.on("disconnect", () => setReconnecting(true));
      socket.on("chat:status", (payload: { sanction?: ChatSanctionView }) => {
        setSanction(payload?.sanction ?? null);
        if (payload?.sanction?.type === "ban") setMessages([]);
      });
      socket.on("chat:message", (message: ChatLine) => remember(message, true));
    });

    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
    // remember is stable enough for the socket lifetime of this player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, guest, player?.id]);

  useEffect(() => {
    if (preview || guest || !player) return;
    const base = serverBase();
    if (!base) return;
    let timer = 0;
    const pull = () => {
      fetch(`${base}/chat/status`, { credentials: "include" })
        .then(async (res) => {
          if (res.status === 401) {
            setGuest(true);
            setPlayer(null);
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          setSanction(data.sanction ?? null);
          if (data.banned || data.sanction?.type === "ban") setMessages([]);
        })
        .catch(() => undefined);
    };
    timer = window.setInterval(pull, 15000);
    window.addEventListener("focus", pull);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", pull);
    };
  }, [preview, guest, player]);

  useEffect(() => {
    if (!open || preview || guest || !player || sanction?.type === "ban") return;
    const base = serverBase();
    if (!base) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${base}/chat/history?limit=50`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as SendResult;
        if (cancelled) return;
        if (res.status === 403 || data.code === "banned") {
          setSanction(data.sanction ?? { type: "ban", expiresAt: null });
          setMessages([]);
          return;
        }
        if (res.status === 401) {
          setGuest(true);
          setPlayer(null);
          return;
        }
        if (!res.ok) {
          setError(errorText(data.message));
          return;
        }
        const next = data.messages || [];
        setMessages((prev) => {
          const byId = new Map<string, ChatLine>();
          for (const line of next) byId.set(line.id, line);
          for (const line of prev) if (!byId.has(line.id)) byId.set(line.id, line);
          const merged = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          seenIds.current = new Set(merged.map((line) => line.id));
          return merged;
        });
        setSanction(data.sanction ?? null);
      })
      .catch(() => {
        if (!cancelled) setError(COPY.sendFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, preview, guest, player, sanction?.type]);

  useEffect(() => {
    if (!open) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages, loading]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    setOpen((was) => {
      if (!was) setUnread(0);
      return !was;
    });
    setError(null);
    setPendingReport(null);
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (preview) {
      const text = draft.trim();
      if (!text) return;
      if (Array.from(text).length > MAX_LEN) {
        setError(COPY.tooLong);
        return;
      }
      remember(
        {
          id: `local-${Date.now()}`,
          userId: player?.id || "preview",
          username: player?.username || "You",
          text,
          createdAt: new Date().toISOString(),
        },
        false
      );
      setDraft("");
      setError(null);
      return;
    }
    const text = draft.trim();
    if (!text || sending || sanction?.type === "mute" || sanction?.type === "ban") return;
    if (Array.from(text).length > MAX_LEN) {
      setError(COPY.tooLong);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await emitOrPost(text);
      if (!result.ok) {
        setError(errorText(result.message));
        if (result.code === "muted") setSanction(result.sanction ?? { type: "mute", expiresAt: null });
        if (result.code === "banned") {
          setSanction({ type: "ban", expiresAt: null });
          setMessages([]);
        }
        return;
      }
      if (result.message && typeof result.message !== "string") remember(result.message, false);
      setDraft("");
    } catch {
      setError(COPY.sendFailed);
    } finally {
      setSending(false);
    }
  }

  function emitOrPost(text: string): Promise<SendResult> {
    const socket = socketRef.current;
    if (socket?.connected) {
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          resolve({ ok: false, code: "send_failed", message: COPY.sendFailed });
        }, 8000);
        socket.emit("chat:send", { text }, (payload: SendResult) => {
          window.clearTimeout(timer);
          resolve(payload || { ok: false, message: COPY.sendFailed });
        });
      });
    }
    const base = serverBase();
    return fetch(`${base}/chat/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as SendResult;
      if (!res.ok) return { ...data, ok: false, message: errorText(data.message) };
      return data;
    });
  }

  async function submitReport() {
    if (!pendingReport) return;
    const messageId = pendingReport;
    setPendingReport(null);
    if (preview) {
      toast(COPY.thanks);
      return;
    }
    const base = serverBase();
    try {
      const res = await fetch(`${base}/chat/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = (await res.json().catch(() => ({}))) as SendResult;
      if (res.status === 409 || data.code === "already_reported") {
        toast(COPY.already);
        return;
      }
      if (!res.ok) {
        toast(errorText(data.message));
        return;
      }
      toast(COPY.thanks);
    } catch {
      toast(COPY.sendFailed);
    }
  }

  if (!authKnown) return null;

  const banned = !guest && sanction?.type === "ban";
  const muted = !guest && sanction?.type === "mute";
  const bubbleTitle = banned ? COPY.bannedShort : COPY.bubble;
  const rootClass = [
    "gc-root",
    dock === "corner" ? "gc-corner" : "",
    placement === "stage" ? "gc-stage" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} data-global-chat={GLOBAL_CHAT_MARKER} data-stamp="STAMP-www-global-chat">
      {open && (
        <section
          className={guest || banned ? "gc-panel gc-short" : "gc-panel"}
          role="dialog"
          aria-label={COPY.title}
        >
          <header className="gc-header">
            <div>
              <div className="gc-title">{guest ? COPY.gateTitle : COPY.title}</div>
              {!guest && <div className="gc-sub">{banned ? COPY.bannedShort : COPY.subtitle}</div>}
              {reconnecting && !guest && <div className="gc-status">{COPY.reconnecting}</div>}
            </div>
            <button type="button" className="gc-icon-btn" onClick={toggle} aria-label={COPY.close}>
              <X size={18} />
            </button>
          </header>

          {guest && (
            <div className="gc-gate">
              <p>{COPY.gateBody}</p>
              <div className="gc-gate-actions">
                <button type="button" className="gc-link-btn" onClick={() => openAuth("login")}>
                  {COPY.signIn}
                </button>
                <Link to="/signUp" className="gc-link-btn secondary">
                  {COPY.createAccount}
                </Link>
              </div>
            </div>
          )}

          {banned && <div className="gc-banned">{COPY.banned}</div>}

          {!guest && !banned && (
            <div className="gc-feed" ref={feedRef}>
              {loading && <div className="gc-loading">{COPY.loading}</div>}
              {!loading && messages.length === 0 && <div className="gc-empty">{COPY.empty}</div>}
              {messages.map((message) => {
                const mine = message.userId === player?.id;
                return (
                  <article key={message.id} className={mine ? "gc-msg mine" : "gc-msg"}>
                    <div className="gc-msg-top">
                      <span className="gc-user">{message.username}</span>
                      <span className="gc-time">{formatClock(message.createdAt)}</span>
                      {!mine && (
                        <button type="button" className="gc-report" onClick={() => setPendingReport(message.id)}>
                          {COPY.report}
                        </button>
                      )}
                    </div>
                    <p className="gc-text">{message.text}</p>
                  </article>
                );
              })}
            </div>
          )}

          {error && !guest && !banned && <div className="gc-error">{error}</div>}

          {pendingReport && !guest && !banned && (
            <div className="gc-confirm">
              <strong>{COPY.confirmTitle}</strong>
              <p>{COPY.confirmBody}</p>
              <div className="gc-confirm-actions">
                <button type="button" className="gc-text-btn primary" onClick={submitReport}>
                  {COPY.report}
                </button>
                <button type="button" className="gc-text-btn" onClick={() => setPendingReport(null)}>
                  {COPY.cancel}
                </button>
              </div>
            </div>
          )}

          {!guest && !banned && muted && <div className="gc-muted">{COPY.muted}</div>}

          {!guest && !banned && !muted && (
            <form className="gc-compose" onSubmit={onSend}>
              <input
                className="gc-input"
                value={draft}
                maxLength={MAX_LEN}
                placeholder={COPY.placeholder}
                aria-label={COPY.placeholder}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button className="gc-send" type="submit" disabled={sending || draft.trim().length === 0}>
                {COPY.send}
              </button>
            </form>
          )}
        </section>
      )}

      <button type="button" className="gc-bubble" onClick={toggle} aria-label={bubbleTitle} title={bubbleTitle}>
        <MessageCircle size={26} />
        {unread > 0 && !open && (
          <span className="gc-badge" aria-label={COPY.newMessages}>
            {badgeLabel(unread)}
          </span>
        )}
      </button>
    </div>
  );
}
