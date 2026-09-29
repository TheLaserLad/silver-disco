import { FormEvent, useRef, useState } from "react";

const SPONSORSHIPS = [
  {
    title: "Branded race",
    text: "Your name on a race people enter on purpose",
  },
  {
    title: "Your ball",
    text: "One of the numbered balls in your colours",
  },
  {
    title: "Winner moment",
    text: "Your brand on the result people share",
  },
  {
    title: "Giveaway",
    text: "A prize tied to a finish",
  },
  {
    title: "Live race",
    text: "Your brand on a scheduled live race",
  },
  {
    title: "Championship",
    text: "Your name on a season as it grows",
  },
] as const;

const SPONSOR_OPTIONS = [...SPONSORSHIPS.map((item) => item.title), "Other"] as const;

const WHY_IT_WORKS = [
  "People choose a ball before the race, so they are watching for it",
  "The finish is easy to share, so the brand travels with the result",
  "On-demand means they can play your race again, not only during a broadcast",
] as const;

type FormState = {
  name: string;
  brand: string;
  email: string;
  sponsorship: string;
  budget: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  email: "",
  sponsorship: "",
  budget: "",
  note: "",
};

export default function SponsorPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const sendingRef = useRef(false);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current) return;

    const serverUrl = import.meta.env.VITE_PY_SERVER_URL as string | undefined;
    if (!serverUrl) {
      setError("We could not send that. Try again in a moment.");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/sponsor-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand,
          email: form.email,
          sponsorship: form.sponsorship,
          budget: form.budget,
          note: form.note,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) {
        const detail = data?.detail;
        setError(
          res.status === 400 && typeof detail === "string" && detail.trim()
            ? detail
            : "We could not send that. Try again in a moment."
        );
        return;
      }
      setSent(true);
    } catch {
      setError("We could not send that. Try again in a moment.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div style={{
      background: "#000000",
      minHeight: "100vh",
      color: "#f0f0f0",
      fontFamily: "'Arial', 'Barlow Condensed', sans-serif",
      padding: "0 0 80px 0",
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');

        .sp-hero {
          position: relative;
          padding: 72px 24px 52px;
          text-align: center;
          overflow: hidden;
        }
        .sp-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 100% 70% at 50% 0%, rgba(146,52,235,0.3) 0%, transparent 65%);
          pointer-events: none;
        }
        .sp-hero::after {
          content: '';
          position: absolute;
          bottom: 0; left: 50%;
          transform: translateX(-50%);
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(146,52,235,0.3), transparent);
        }
        .sp-title {
          font-family: 'Inter', Arial, sans-serif;
          font-size: clamp(28px, 6vw, 52px);
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.05;
          margin: 0 0 20px;
          background: linear-gradient(135deg, #ffffff 0%, #c084fc 60%, #9234eb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .sp-subtitle {
          font-size: 17px;
          color: rgba(240,240,240,0.6);
          max-width: 560px;
          margin: 0 auto;
          line-height: 1.65;
        }

        .sp-section-label {
          font-family: 'Inter', Arial, sans-serif;
          font-size: 10px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #9234eb;
          display: flex;
          align-items: center;
          gap: 12px;
          max-width: 680px;
          padding: 0 20px;
          margin: 48px auto 24px;
        }
        .sp-section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(146,52,235,0.25);
        }

        .sp-activations,
        .sp-why {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          gap: 12px;
        }
        .sp-activations { grid-template-columns: repeat(3, 1fr); }
        .sp-why { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 720px) {
          .sp-activations,
          .sp-why { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) {
          .sp-activations,
          .sp-why { grid-template-columns: 1fr; }
        }

        .sp-act-card,
        .sp-why-card {
          background: #121212;
          border: 1px solid rgba(146,52,235,0.18);
          border-radius: 8px;
          padding: 22px 16px 18px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .sp-act-card::before,
        .sp-why-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #9234eb, rgba(192,132,252,0.4), transparent);
        }
        .sp-act-title {
          display: block;
          font-family: 'Inter', Arial, sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: rgba(240,240,240,0.92);
          margin-bottom: 8px;
          letter-spacing: 0.01em;
        }
        .sp-act-text,
        .sp-why-card p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(240,240,240,0.62);
        }

        .sp-cta-wrap {
          max-width: 680px;
          margin: 36px auto 0;
          padding: 0 20px;
        }
        .sp-cta-card {
          background: #121212;
          border: 1px solid rgba(146,52,235,0.3);
          border-radius: 12px;
          padding: 40px 32px;
          position: relative;
          overflow: hidden;
        }
        .sp-cta-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #9234eb, #c084fc, #9234eb);
        }
        .sp-cta-card::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(146,52,235,0.1) 0%, transparent 70%);
          pointer-events: none;
        }
        .sp-cta-title {
          font-family: 'Inter', Arial, sans-serif;
          font-size: 22px;
          font-weight: 900;
          color: #fff;
          margin: 0 0 20px;
          letter-spacing: 0.02em;
          position: relative;
          z-index: 1;
          text-align: center;
        }
        .sp-form {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-width: 460px;
          margin: 0 auto;
          text-align: left;
        }
        .sp-field label {
          display: block;
          font-family: 'Inter', Arial, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(240,240,240,0.55);
          margin-bottom: 6px;
        }
        .sp-optional {
          text-transform: none;
          letter-spacing: 0;
          font-weight: 400;
          color: rgba(240,240,240,0.35);
        }
        .sp-field input,
        .sp-field select,
        .sp-field textarea {
          width: 100%;
          box-sizing: border-box;
          background: #0a0a0a;
          border: 1px solid rgba(146,52,235,0.28);
          border-radius: 6px;
          color: #f0f0f0;
          padding: 12px 14px;
          font-size: 15px;
          font-family: Arial, sans-serif;
        }
        .sp-field select {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #c084fc 50%), linear-gradient(135deg, #c084fc 50%, transparent 50%);
          background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px);
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
          background-color: #0a0a0a;
          padding-right: 36px;
        }
        .sp-field textarea {
          min-height: 110px;
          resize: vertical;
        }
        .sp-field input:focus,
        .sp-field select:focus,
        .sp-field textarea:focus {
          outline: none;
          border-color: rgba(146,52,235,0.75);
        }
        .sp-cta-btn {
          display: inline-block;
          width: 100%;
          background: linear-gradient(135deg, #9234eb 0%, #7c22d4 100%);
          color: #fff;
          font-family: 'Inter', Arial, sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 14px 36px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          box-shadow: 0 0 24px rgba(146,52,235,0.4);
        }
        .sp-cta-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 32px rgba(146,52,235,0.55);
        }
        .sp-cta-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .sp-error {
          margin: 0;
          color: #fca5a5;
          font-size: 14px;
          line-height: 1.4;
        }
        .sp-confirm {
          position: relative;
          z-index: 1;
          text-align: center;
          padding: 12px 0 8px;
        }
        .sp-confirm p {
          margin: 0;
          font-size: 16px;
          color: rgba(240,240,240,0.75);
          line-height: 1.6;
        }
        @media (max-width: 520px) {
          .sp-cta-card { padding: 32px 18px; }
        }
      `}</style>

      <div className="sp-hero">
        <h1 className="sp-title">Sponsor the Race</h1>
        <p className="sp-subtitle">
          Put your brand on a race people actually play. They pick a ball, watch it finish, and share the result. Your name can be on that moment.
        </p>
      </div>

      <div className="sp-section-label">What you can sponsor</div>
      <div className="sp-activations">
        {SPONSORSHIPS.map((item) => (
          <div key={item.title} className="sp-act-card">
            <span className="sp-act-title">{item.title}</span>
            <span className="sp-act-text">{item.text}</span>
          </div>
        ))}
      </div>

      <div className="sp-section-label">Why it works</div>
      <div className="sp-why">
        {WHY_IT_WORKS.map((point) => (
          <div key={point} className="sp-why-card">
            <p>{point}</p>
          </div>
        ))}
      </div>

      <div className="sp-cta-wrap">
        <div className="sp-cta-card">
          <h2 className="sp-cta-title">Talk to us</h2>
          {sent ? (
            <div className="sp-confirm" role="status">
              <p>Thanks. We will reply by email.</p>
            </div>
          ) : (
            <form className="sp-form" onSubmit={submit}>
              <div className="sp-field">
                <label htmlFor="sponsor-name">Name</label>
                <input
                  id="sponsor-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  required
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </div>
              <div className="sp-field">
                <label htmlFor="sponsor-brand">Brand or company</label>
                <input
                  id="sponsor-brand"
                  name="brand"
                  type="text"
                  autoComplete="organization"
                  maxLength={160}
                  required
                  value={form.brand}
                  onChange={(event) => update("brand", event.target.value)}
                />
              </div>
              <div className="sp-field">
                <label htmlFor="sponsor-email">Email</label>
                <input
                  id="sponsor-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  required
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              </div>
              <div className="sp-field">
                <label htmlFor="sponsor-kind">What do you want to sponsor</label>
                <select
                  id="sponsor-kind"
                  name="sponsorship"
                  required
                  value={form.sponsorship}
                  onChange={(event) => update("sponsorship", event.target.value)}
                >
                  <option value="" disabled>Choose one</option>
                  {SPONSOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="sp-field">
                <label htmlFor="sponsor-budget">
                  Rough budget <span className="sp-optional">(optional)</span>
                </label>
                <input
                  id="sponsor-budget"
                  name="budget"
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  value={form.budget}
                  onChange={(event) => update("budget", event.target.value)}
                />
              </div>
              <div className="sp-field">
                <label htmlFor="sponsor-note">Note</label>
                <textarea
                  id="sponsor-note"
                  name="note"
                  maxLength={2000}
                  required
                  value={form.note}
                  onChange={(event) => update("note", event.target.value)}
                />
              </div>
              {error && <p className="sp-error" role="alert">{error}</p>}
              <button className="sp-cta-btn" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send request"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
