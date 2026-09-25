"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HiBars3, HiXMark } from "react-icons/hi2";
import { MdClose } from "react-icons/md";
import { FaGoogle, FaTwitch } from "react-icons/fa";
import { SiTiktok } from "react-icons/si";
import logo from "../../assets/orilogo.png";
import Footer from "../../components/Footer";
import HowToPlay from "../../components/howtoplay";
import HowPointsWork from "../../components/howpointsworks";
import SponsorPage from "../../components/sponcerpage";

type Mode = "login" | "signup" | null;

const HomePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<"how-to-play" | "how-points-work" | "sponsor" | null>(null);  const [authMode, setAuthMode] = useState<Mode>(null);
  const [checking, setChecking] = useState(true);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landingData, setLandingData] = useState<any>(null);
  const [playAfterAuth, setPlayAfterAuth] = useState(false);
  const serverUrl: string | undefined = import.meta.env.VITE_SERVER_URL;
  const navigate = useNavigate();

  const dailyOnDemandLimit = (() => {
    const raw = landingData?.max_offline_race;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const racesCompleted =
    typeof landingData?.total_races === "number" ? landingData.total_races : null;

  const homeAfterAuth = playAfterAuth ? "/home?play=1" : "/home";

  const openPlay = () => {
    setPlayAfterAuth(true);
    setAuthMode("signup");
  };

  // ✅ Check session
  useEffect(() => {
    if (!serverUrl) {
      console.warn("VITE_SERVER_URL not set");
      setChecking(false);
      return;
    }
    axios
      .get(`${import.meta.env.VITE_PY_SERVER_URL}/landing`)
      .then((res) => setLandingData(res.data))
      .catch((err) => console.error("Failed to fetch landing data", err));
    axios
      .get(`${serverUrl}/home`, { withCredentials: true })
      .then(() => navigate("/home"))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [serverUrl, navigate]);

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirm("");
    setError(null);
    setSubmitting(false);
  };

  // ✅ Handle login/signup
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl) return setError("Server URL missing.");

    try {
      setSubmitting(true);
      setError(null);

      if (authMode === "login") {
        if (!username || !password) return setError("Enter username & password.");
        const res = await axios.post(
          `${serverUrl}/demo_login`,
          { username, password },
          { withCredentials: true }
        );
        if (res.data?.type === "User") navigate(homeAfterAuth);
        else if (res.data?.type === "Admin") navigate("/dashboard");
      } else if (authMode === "signup") {
        if (!username || !email || !password || !confirm)
          return setError("Fill out all fields.");
        if (password !== confirm) return setError("Passwords do not match.");
        const res = await axios.post(
          `${serverUrl}/demo_sign_up`,
          { username, email, password },
          { withCredentials: true }
        );
        if (res.data?.user) navigate(homeAfterAuth);
      }

      setAuthMode(null);
      resetForm();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Request failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const loginWithTiktok = () => {
    if (serverUrl) window.location.href = `${serverUrl}/authenticate_tiktok`;
  };
  const loginWithGoogle = () => {
    if (serverUrl) window.location.href = `${serverUrl}/auth/google`;
  };
  const loginWithTwitch = () => {
    if (serverUrl) window.location.href = `${serverUrl}/unrestricted/twitch`;
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-gray-400">
        Checking session…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-black text-white overflow-hidden">
      <header className="relative flex items-center justify-between px-5 py-4 bg-black border-b border-gray-800">
        <img src={logo} alt="Logo" className="h-10 w-auto" />
 
        {/* Center design element */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-32 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full shadow-lg" />
        </div>
 
        {/* Hamburger — right side, all screen sizes */}
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "1px solid #444",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <HiBars3 size={20} color="#fff" />
        </button>
      </header>
 
      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
 
      {/* Slide-in sidebar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: sidebarOpen ? 0 : "-260px",
          width: "240px",
          height: "100vh",
          background: "#121212",
          borderLeft: "1px solid #2a2a2a",
          zIndex: 50,
          transition: "right 0.25s ease",
          display: "flex",
          flexDirection: "column",
          paddingTop: "64px",
          fontFamily: "Arial, Inter, sans-serif",
          overflowY: "auto",
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "#fff",
          }}
        >
          <HiXMark size={22} />
        </button>
 
        {/* Login / Signup */}
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            onClick={() => { setAuthMode("login"); setSidebarOpen(false); }}
          >
            Login
          </button>
          <button
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            onClick={() => { setAuthMode("signup"); setSidebarOpen(false); }}
          >
            Sign Up
          </button>
        </div>
 
        <div style={{ height: "1px", background: "#2a2a2a", margin: "0 20px 8px" }} />
 
        {/* 3 page links */}
        {(
          [
            { label: "How to Play",      page: "how-to-play" },
            { label: "How Points Work",  page: "how-points-work" },
            { label: "Sponsor the Race", page: "sponsor" },
          ] as { label: string; page: "how-to-play" | "how-points-work" | "sponsor" }[]
        ).map((item) => (
          <button
            key={item.page}
            onClick={() => { setActivePage(item.page); setSidebarOpen(false); }}
            style={{
              background: "none",
              border: "none",
              borderBottom: "1px solid #2a2a2a",
              color: "#f0f0f0",
              fontSize: "15px",
              textAlign: "left",
              padding: "14px 20px",
              cursor: "pointer",
              fontFamily: "Arial, Inter, sans-serif",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
 
      {/* Full-screen overlay for info pages */}
      {activePage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "#000000",
            overflowY: "auto",
          }}
        >
          <button
            onClick={() => setActivePage(null)}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 101,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#121212",
              border: "none",
              borderBottom: "1px solid #2a2a2a",
              color: "#f0f0f0",
              fontSize: "14px",
              padding: "12px 20px",
              cursor: "pointer",
              width: "100%",
              fontFamily: "Arial, Inter, sans-serif",
            }}
          >
            ← Back
          </button>
 
          {activePage === "how-to-play"     && <HowToPlay />}
          {activePage === "how-points-work" && <HowPointsWork />}
          {activePage === "sponsor"         && <SponsorPage />}
        </div>
      )}
 
{/* ===== HERO SECTION (With Video Background Placeholder) ===== */}
      <main className="relative flex flex-col items-center justify-center flex-grow text-center px-6 py-14 sm:py-24 overflow-hidden">
        {/* Background Video Placeholder */}
        <div className="absolute inset-0 z-0 bg-[#0a0a0a]">
          {/* Served from ui/public/demo.mp4 rather than imported, so the build
              still succeeds when the (large, uncommitted) video is absent —
              a missing file just leaves the dark background showing. */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-30"
          >
            <source src="/demo.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#111111]"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <p className="text-xs sm:text-sm uppercase tracking-[0.25em] text-purple-300 font-semibold mb-4">
            Open now · Play for free
          </p>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 text-transparent bg-clip-text mb-6">
            Pick a Ball. Win the Race.
          </h1>
          
          <div className="text-gray-300 text-base sm:text-lg max-w-2xl space-y-2 mb-4">
            <p className="font-semibold text-white text-xl">Race for free. Play on-demand.</p>
            <p>Choose your ball, watch the race on the real track, and results appear automatically when the race finishes. New races available every day.</p>
          </div>

          <p className="text-sm text-gray-400 uppercase tracking-widest font-semibold mb-8">
            Brand sponsored prizes • Real physical track
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={openPlay}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-8 py-4 rounded-xl text-md font-bold text-white shadow-lg shadow-purple-500/30 transition-all"
            >
              Play On-Demand Race
            </button>
            <button
              onClick={() => {
                setPlayAfterAuth(false);
                setAuthMode("login");
              }}
              className="border border-gray-600 hover:border-gray-300 px-8 py-4 rounded-xl text-md font-semibold text-gray-300 transition-all bg-black/40 backdrop-blur-sm"
            >
              I already have an account
            </button>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById("live-events")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-5 text-sm text-gray-500 hover:text-gray-300 underline underline-offset-4"
          >
            Live Events
          </button>
        </div>
      </main>

      {/* On-demand status. Counts come only from /landing — nothing is filled in when the API is missing. */}
      <section className="w-full bg-[#161616] border-y border-[#2a2a2a] py-4 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center md:justify-between gap-6 text-sm font-medium text-gray-300">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
            </span>
            <span className="text-white font-semibold">Open now</span>
          </div>

          <div className="flex items-center gap-2">
            Play for free
          </div>

          {dailyOnDemandLimit !== null && (
            <div className="flex items-center gap-2">
              Up to {dailyOnDemandLimit.toLocaleString()} on-demand races a day
            </div>
          )}

          {racesCompleted !== null && (
            <div className="flex items-center gap-2">
              {racesCompleted.toLocaleString()} races completed
            </div>
          )}
        </div>
      </section>

      {/* ===== DAILY FORMAT ===== */}
      <section className="py-20 px-6 bg-[#111111]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">The Daily Format</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-purple-500/50 hover:border-purple-400 transition-colors">
              <h3 className="text-xl font-bold text-white mb-4">
                On-Demand Races
                {dailyOnDemandLimit !== null && (
                  <span className="block text-sm font-normal text-purple-400 mt-1">
                    Up to {dailyOnDemandLimit.toLocaleString()} a day
                  </span>
                )}
              </h3>
              <p className="text-gray-400 text-sm mb-4">Choose your ball. Watch the race. Results appear automatically when the race finishes. New races available every day.</p>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>Open now. Play for free.</li>
                <li>Recorded on the real physical track</li>
                <li>AI-verified finish order</li>
              </ul>
            </div>

            <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-[#2a2a2a] hover:border-pink-500/50 transition-colors">
              <h3 className="text-xl font-bold text-white mb-4">Season Rankings <span className="block text-sm font-normal text-pink-400 mt-1">Ongoing</span></h3>
              <p className="text-gray-400 text-sm">Every race counts. On-demand races add to your daily, weekly, and seasonal standings.</p>
            </div>

            <div id="live-events" className="bg-[#1a1a1a] p-8 rounded-2xl border border-[#2a2a2a] hover:border-indigo-500/40 transition-colors scroll-mt-6">
              <h3 className="text-xl font-bold text-white mb-4">Live Events <span className="block text-sm font-normal text-gray-500 mt-1">Optional</span></h3>
              <p className="text-gray-400 text-sm mb-4">
                {landingData?.is_live
                  ? "A live broadcast is on. You can race in real time as well. On-demand play does not wait for it."
                  : "Live broadcasts are extra. You do not need one to play. On-demand races are open now."}
              </p>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>Same track, same leaderboard</li>
                <li>Join only when a broadcast is on</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
        <section id="how" className="py-20 px-6 bg-[#0a0a0a] border-t border-[#1e1e1e]">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-white">How It Works</h2>
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { step: "1", title: "Enter For Free", desc: "Open now. Play for free." },
            { step: "2", title: "Choose your ball", desc: "Pick a ball from 1–15." },
            { step: "3", title: "Watch the race", desc: "Play an on-demand race filmed on the real track." },
            { step: "4", title: "Get your result", desc: "Results appear automatically when the race finishes. New races available every day." }
          ].map((item, i) => (
            <div key={i} className="text-center flex flex-col items-center">
              {/* Styled Purple Box */}
              <div className="w-12 h-12 mb-4 flex items-center justify-center bg-purple-600 text-white text-2xl font-bold rounded-xl shadow-lg shadow-purple-500/20">
                {item.step}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== WHAT MAKES THIS DIFFERENT ===== */}
      <section id="features" className="py-20 px-6 bg-[#111111] border-t border-[#1e1e1e]">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">What Makes This Different</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {[
            { title: "Real Physical Track", desc: "Every race happens on our custom built racetrack." },
            { title: "AI Verified Results", desc: "Finish order detected instantly and accurately." },
            { title: "Global Leaderboards", desc: "Compete with players worldwide for the top spot." },
            { title: "Real Rewards", desc: "Win real prizes funded by official sponsors." }
          ].map((f, i) => (
            <div key={i} className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#2a2a2a]">
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

        {/* ===== SPONSOR INTEGRATION ===== */}
      <section className="py-16 px-6 bg-[#0a0a0a] border-t border-[#1e1e1e] text-center">
        <h3 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-8">Powered By Our Sponsors</h3>
        
        {/* Dynamic Sponsor Logos */}
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-80 hover:opacity-100 transition-all duration-500 mb-8">
          {landingData?.sponsors && landingData.sponsors.length > 0 ? (
            landingData.sponsors.map((sponsor: any, idx: number) => (
              <img 
                key={idx} 
                src={sponsor.logo} 
                alt={sponsor.name} 
                className="h-12 md:h-16 w-auto object-contain" 
              />
            ))
          ) : (
            <div className="h-8 md:h-12 px-6 bg-gray-800 rounded flex items-center justify-center text-xs text-gray-500 font-mono">AVAILABLE SPONSOR SPOT</div>
          )}
        </div>

        {/* Dynamic Sponsor Title */}
        {landingData?.sponsors && landingData.sponsors.length > 0 && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-gray-400 mb-6">
            <span className="bg-[#1a1a1a] px-4 py-2 rounded-full border border-[#2a2a2a]">
              {landingData.sponsors[0].name}
            </span>
          </div>
        )}

            <button 
            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium underline underline-offset-4" 
            onClick={() => window.location.href = 'mailto:thelaserlad1@gmail.com'}
            >
              Become a Sponsor
        </button>
      </section>

      
      {/* ===== BOTTOM CTA ===== */}
      <section className="py-20 px-6 text-center bg-gradient-to-br from-indigo-900 via-purple-900 to-black border-t border-purple-500/30">
        <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">Don’t Just Watch. Race.</h2>
        <button
          onClick={openPlay}
          className="mt-6 bg-white text-purple-900 px-10 py-4 rounded-xl text-lg font-bold hover:bg-gray-200 transition-colors shadow-xl shadow-black/40"
        >
          Play On-Demand Race
        </button>
        <p className="text-purple-300 mt-4 text-sm font-medium">Free to join. Open now.</p>
      </section>

      {/* AUTH MODAL */}
      <AnimatePresence>
        {authMode && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gradient-to-b from-[#1b1530] to-[#281e48] border border-gray-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="text-center text-2xl font-bold mb-5">
                {authMode === "login" ? "Login" : "Create Account"}
              </h2>

              {error && (
                <div className="bg-red-900/40 border border-red-600 text-red-300 text-sm rounded-md p-2 mb-4">
                  {error}
                </div>
              )}

              <form className="flex flex-col gap-4" onSubmit={handleAuthSubmit}>
                <input
                  type="text"
                  placeholder="Username"
                  className="bg-black/50 border border-gray-700 p-3 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 outline-none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                {authMode === "signup" && (
                  <input
                    type="email"
                    placeholder="Email"
                    className="bg-black/50 border border-gray-700 p-3 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                )}
                <input
                  type="password"
                  placeholder="Password"
                  className="bg-black/50 border border-gray-700 p-3 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {authMode === "signup" && (
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    className="bg-black/50 border border-gray-700 p-3 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 outline-none"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg font-semibold text-white transition"
                >
                  {submitting
                    ? authMode === "login"
                      ? "Signing in…"
                      : "Creating account…"
                    : authMode === "login"
                    ? "Login"
                    : "Sign Up"}
                </button>
              </form>

              {/* Social Logins */}
              <div className="mt-5 text-center">
                <p className="text-gray-400 text-sm mb-3">Or continue with</p>
                <div className="flex justify-center gap-3">
                  <button
                    className="bg-[#1b1b1b] hover:bg-[#2a2a2a] p-3 rounded-full border border-gray-700"
                    onClick={loginWithTiktok}
                  >
                    <SiTiktok className="text-pink-500" />
                  </button>
                  <button
                    className="bg-[#1b1b1b] hover:bg-[#2a2a2a] p-3 rounded-full border border-gray-700"
                    onClick={loginWithGoogle}
                  >
                    <FaGoogle className="text-red-500" />
                  </button>
                  <button
                    className="bg-[#1b1b1b] hover:bg-[#2a2a2a] p-3 rounded-full border border-gray-700"
                    onClick={loginWithTwitch}
                  >
                    <FaTwitch className="text-purple-500" />
                  </button>
                </div>
              </div>

              {/* Switch + Close */}
              <div className="flex justify-between items-center mt-6">
                <button
                  className="text-sm text-purple-400 hover:underline"
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "signup" : "login")
                  }
                >
                  {authMode === "login"
                    ? "Need an account? Sign Up"
                    : "Already have an account? Login"}
                </button>
                <MdClose
                  size={22}
                  className="text-gray-400 cursor-pointer hover:text-white"
                  onClick={() => {
                    setAuthMode(null);
                    resetForm();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <Footer />
    </div>
  );
};

export default HomePage;







