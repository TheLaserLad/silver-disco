// src/components/PinballRaceHeader.tsx
import React, { useEffect, useState } from "react";
import { HiBars3 } from "react-icons/hi2";
import logo from "../assets/orilogo.png";
import HowToPlay from "../components/howtoplay";
import HowPointsWork from "../components/howpointsworks";
import SponsorPage from "../components/sponcerpage";

interface Props {
  pfp?: string | null;
  username?: string | null;
  onSearchClick?: () => void;
  sidebarsection?: () => void;
}

type ActivePage = "how-to-play" | "how-points-work" | "sponsor" | null;

const PinballRaceHeader: React.FC<Props> = ({
  pfp,
  username,
  sidebarsection,
}) => {
  const [userPfp, setUserPfp] = useState<string | undefined>(pfp ?? undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePage, setActivePage] = useState<ActivePage>(null);
  const fallbackPfp = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  useEffect(() => {
    if (pfp) {
      setUserPfp(pfp ?? undefined);
      return;
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    if (!serverUrl) {
      console.warn("VITE_SERVER_URL not set; using fallback avatar.");
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${serverUrl}/get_profile`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const userData = data.user || data;
        if (mounted) {
          setUserPfp(userData.pfp ?? userData.profilePic ?? undefined);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      }
    })();

    return () => { mounted = false; };
  }, [pfp, username]);

  const handleSidebarToggle = () => {
    setSidebarOpen((prev) => !prev);
    sidebarsection?.();
  };

  const openPage = (page: ActivePage) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  const logout = async () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    try {
      const res = await fetch(`${serverUrl}/unrestricted/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        console.error("Logout failed:", res.status);
        return;
      }
    } catch (err) {
      console.error("Logout failed:", err);
      return;
    }
    window.location.href = "/";
  };

  const navItems: { label: string; page: ActivePage }[] = [
    { label: "How to Play",      page: "how-to-play" },
    { label: "How Points Work",  page: "how-points-work" },
    { label: "Sponsor the Race", page: "sponsor" },
  ];

  const renderActivePage = () => {
    switch (activePage) {
      case "how-to-play":     return <HowToPlay />;
      case "how-points-work": return <HowPointsWork />;
      case "sponsor":         return <SponsorPage />;
      default:                return null;
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 bg-[#121212] text-white shadow-md h-16 w-full">
        <div className="flex items-center">
          <img
            src={userPfp || fallbackPfp}
            className="w-10 h-10 rounded-full object-cover border-2 border-gray-700"
          />
        </div>

        <div className="flex justify-center items-center">
          <img src={logo} alt="Pinball Race Logo" className="h-20 object-contain select-none" />
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSidebarToggle}
            className="p-2 rounded-full border border-gray-600 hover:bg-gray-800 transition"
            aria-label="Sidebar"
          >
            <HiBars3 size={20} />
          </button>
        </div>
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
          right: sidebarOpen ? 0 : "-220px",
          width: "200px",
          height: "100vh",
          background: "#121212",
          borderLeft: "1px solid #2a2a2a",
          zIndex: 50,
          transition: "right 0.25s ease",
          display: "flex",
          flexDirection: "column",
          paddingTop: "72px",
          paddingLeft: "24px",
          paddingRight: "24px",
          fontFamily: "Arial, Inter, sans-serif",
          // Closed, this panel sits off-screen. It must not eat taps on the ball grid.
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}
      >
        {navItems.map((item) => (
          <button
            key={item.page}
            onClick={() => openPage(item.page)}
            style={{
              background: "none",
              border: "none",
              borderBottom: "1px solid #2a2a2a",
              color: "#f0f0f0",
              fontSize: "15px",
              textAlign: "left",
              padding: "14px 0",
              cursor: "pointer",
              fontFamily: "Arial, Inter, sans-serif",
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={logout}
          style={{
            marginTop: "auto",
            marginBottom: "32px",
            background: "none",
            border: "none",
            color: "#f87171",
            fontSize: "15px",
            textAlign: "left",
            padding: "14px 0",
            cursor: "pointer",
            fontFamily: "Arial, Inter, sans-serif",
          }}
        >
          Log out
        </button>
      </div>

      {/* Full-screen overlay */}
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
          {/* Sticky back bar */}
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

          {renderActivePage()}
        </div>
      )}
    </>
  );
};

export default PinballRaceHeader;