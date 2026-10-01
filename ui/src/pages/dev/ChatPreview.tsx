import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GlobalChat, { ChatLine, GlobalChatPreview } from "../../components/GlobalChat";

/**
 * Dev-only stage for the global chat bubble. Not a live route.
 * Production builds omit this page (see main.tsx).
 */
const SAMPLE: ChatLine[] = [
  {
    id: "m1",
    userId: "other",
    username: "neonflip",
    text: "That last ramp was filthy.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m2",
    userId: "preview-player",
    username: "you",
    text: "Ball 7 is heating up.",
    createdAt: new Date().toISOString(),
  },
];

type Panel = "closed" | "open" | "muted" | "banned" | "guest";

export default function ChatPreview() {
  const [params, setParams] = useSearchParams();
  const panel = (params.get("panel") || "closed") as Panel;
  const [picked, setPicked] = useState(7);

  const preview: GlobalChatPreview = useMemo(() => {
    if (panel === "guest") return { auth: "guest", open: true };
    if (panel === "muted") {
      return {
        auth: "player",
        userId: "preview-player",
        username: "you",
        messages: SAMPLE,
        open: true,
        sanction: { type: "mute", expiresAt: null },
      };
    }
    if (panel === "banned") {
      return {
        auth: "player",
        userId: "preview-player",
        username: "you",
        open: true,
        sanction: { type: "ban", expiresAt: null },
      };
    }
    return {
      auth: "player",
      userId: "preview-player",
      username: "you",
      messages: panel === "open" ? SAMPLE : [],
      open: panel === "open",
      unread: panel === "closed" ? 2 : 0,
    };
  }, [panel]);

  const setPanel = (next: Panel) => {
    const copy = new URLSearchParams(params);
    copy.set("panel", next);
    setParams(copy, { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07070b", color: "#f4f4f5" }}>
      <div className="chat-preview-stage">
        <p style={{ color: "#a1a1aa", fontSize: 12, padding: "14px 16px 0" }}>
          Draft preview — not live. Bubble stays clear of ball pick and video.
        </p>
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
          {(["closed", "open", "muted", "guest"] as Panel[]).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setPanel(name)}
              style={{
                borderRadius: 999,
                border: panel === name ? "1px solid #a855f7" : "1px solid #3f3f46",
                background: panel === name ? "#2e1064" : "#18181b",
                color: "#fafafa",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              {name === "closed" ? "Signed-in" : name === "open" ? "Open" : name === "muted" ? "Muted" : "Guest gate"}
            </button>
          ))}
        </div>
        <section style={{ padding: "4px 16px 0" }}>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>Home</h1>
          <p style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 8 }}>
            Dark theme · on-demand race · balls 1–15 below. Chat must not cover these.
          </p>
          <div
            style={{
              height: 112,
              borderRadius: 16,
              border: "1px solid #2a2a2a",
              background: "#16161d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#71717a",
              marginBottom: 12,
            }}
          >
            Race video area
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
            }}
          >
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Ball ${n}`}
                onClick={() => setPicked(n)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: "999px",
                  border: picked === n ? "2px solid #a855f7" : "1px solid #3f3f46",
                  background: "#3f3f46",
                  color: "#fafafa",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 72,
            background: "#252525",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        />
        <GlobalChat key={panel} dock="above-footer" placement="stage" preview={preview} />
      </div>
      <style>{`
        .chat-preview-stage {
          position: relative;
          width: min(420px, 100%);
          min-height: 100vh;
          margin: 0 auto;
          background: #0e0d12;
          overflow: hidden;
        }
        .chat-preview-stage .gc-panel {
          height: 210px;
        }
      `}</style>
    </div>
  );
}
