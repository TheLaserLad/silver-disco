"use client";

import { useState, useEffect } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
      checked ? "bg-[#8b5cf6]" : "bg-gray-700"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    role="switch"
    aria-checked={checked}
    style={{ transition: "background-color 0.2s, transform 0.2s" }}
  >
    <span className="sr-only">Toggle notification</span>
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
        checked ? "translate-x-5" : "translate-x-0.5"
      }`}
      style={{
        transition: "transform 0.2s ease-in-out",
        marginTop: "1px",
      }}
    />
  </button>
);

const NotificationSettings: React.FC<{ userId: string }> = ({ userId }) => {
  const [raceReminders, setRaceReminders] = useState(true);
  const [raceResults, setRaceResults] = useState(true);
  const [competitionUpdates, setCompetitionUpdates] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch initial settings on load
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_PY_SERVER_URL}/api/user/notifications/${userId}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setRaceReminders(data.raceReminders ?? true);
          setRaceResults(data.raceResults ?? true);
          setCompetitionUpdates(data.competitionUpdates ?? true);
          setWeeklySummary(data.weeklySummary ?? true);
        }
      } catch (error) {
        console.error("Failed to fetch notification settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) fetchSettings();
  }, [userId]);

  // 2. Handle the toggle and save to DB
  const handleToggle = async (key: string, currentValue: boolean, setter: (val: boolean) => void) => {
    const newValue = !currentValue;
    
    // Optimistic UI update (feels instantly responsive)
    setter(newValue);

    // Prepare payload based on current state + the one changing right now
    const payload = {
      userId,
      raceReminders: key === "raceReminders" ? newValue : raceReminders,
      raceResults: key === "raceResults" ? newValue : raceResults,
      competitionUpdates: key === "competitionUpdates" ? newValue : competitionUpdates,
      weeklySummary: key === "weeklySummary" ? newValue : weeklySummary,
    };

    try {
      const res = await fetch(`${import.meta.env.VITE_PY_SERVER_URL}/api/user/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Error updating notifications:", error);
      // Revert the toggle if the API failed
      setter(currentValue);
    }
  };

  const notificationOptions = [
    {
      id: "raceReminders",
      title: "Race Reminders",
      description: "Get notified a few minutes before the race starts.",
      state: raceReminders,
      setter: setRaceReminders,
    },
    {
      id: "raceResults",
      title: "Race Results",
      description: "Instant updates when new race results are available.",
      state: raceResults,
      setter: setRaceResults,
    },
    {
      id: "competitionUpdates",
      title: "Competition Updates",
      description: "Stay informed about new challenges and event winners.",
      state: competitionUpdates,
      setter: setCompetitionUpdates,
    },
    {
      id: "weeklySummary",
      title: "Weekly Summary",
      description: "Receive a short summary of your weekly race performance.",
      state: weeklySummary,
      setter: setWeeklySummary,
    },
  ];

  if (isLoading) {
    return <div className="text-white p-6">Loading settings...</div>;
  }

  return (
    <div className="w-full max-w-md bg-[#1c1c21] rounded-2xl shadow-xl p-4 sm:p-6">
      <h2 className="text-lg font-bold text-white mb-5 pl-2">
        Notifications & alerts
      </h2>

      <div className="space-y-3">
        {notificationOptions.map((option) => (
          <div
            key={option.id}
            className="bg-[#2a2a2e] p-4 rounded-xl flex items-center justify-between min-h-[65px]"
          >
            <div className="flex-1 pr-3">
              <p className="text-sm font-semibold text-white mb-0.5">
                {option.title}
              </p>
              <p className="text-[13px] text-gray-400 leading-snug line-clamp-2 max-w-[90%]">
                {option.description}
              </p>
            </div>

            <div className="flex-shrink-0 ml-2">
              <ToggleSwitch
                checked={option.state}
                onChange={() => handleToggle(option.id, option.state, option.setter)}
                disabled={isLoading}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationSettings;