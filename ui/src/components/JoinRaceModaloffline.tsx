import React, { useState, useEffect } from "react";
import { X, Play, SkipForward, Trophy, MapPin } from "lucide-react";
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

// Define the structure of the API response
interface OfflineGameResult {
  video_link: string;
  user_ball: string;
  user_position: string;
  user_points: number;
}

type ModalStep = 'select' | 'video' | 'result';

const JoinRaceModal: React.FC<JoinRaceModalProps> = ({ onClose }) => {
  // UI State
  const [step, setStep] = useState<ModalStep>('select');
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [selectedBall, setSelectedBall] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<OfflineGameResult | null>(null);

  // Refs

  // Env vars
  const serverUrl = import.meta.env.VITE_PY_SERVER_URL;
  const serverurl1 = import.meta.env.VITE_SERVER_URL;
  const [videoCountdown, setVideoCountdown] = useState(30);
  const [canSkipVideo, setCanSkipVideo] = useState(false);

  // Countdown only runs while the race video is actually on screen
  useEffect(() => {
    if (step !== 'video') return;

    setVideoCountdown(30);
    setCanSkipVideo(false);

    const timer = setInterval(() => {
      setVideoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkipVideo(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  // Helper to ensure autoplay is forced on the URL
  const getAutoplayUrl = (url: string) => {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set("autoplay", "1");
      // urlObj.searchParams.set("mute", "1"); // Uncomment if browser blocks autoplay
      return urlObj.toString();
    } catch (e) {
      return url.includes("?") ? `${url}&autoplay=1` : `${url}?autoplay=1`;
    }
  };
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
        throw new Error(errorDetail);
      }

      const result: OfflineGameResult = await res.json();
      
      // Store result and switch to video view
      setGameResult(result);
      setStep('video'); 
      
    } catch (err: any) {
      toast.error(err?.message || "Error joining the race");
    } finally {
      setLoading(false);
    }
  };

  // 3. Helper to finish video (Watch complete or Skip)
  const handleVideoComplete = () => {
    setStep('result');
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

      <div className="flex justify-end items-center p-4 border-t border-gray-800 bg-[#1a1a1a] space-x-4">
        <button onClick={onClose} className="text-gray-400 hover:text-white transition text-sm font-medium">
          Cancel
        </button>
        <button
          className={`px-6 py-2 rounded-full font-semibold text-white transition flex items-center gap-2
            ${selectedBall ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-700 cursor-not-allowed"}
          `}
          disabled={!selectedBall || !userId || loading}
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
        
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 z-50 bg-black/40 hover:bg-red-600 p-2 rounded-full text-white transition backdrop-blur-sm"
        >
          <X size={24} />
        </button>

        {gameResult?.video_link ? (
          <iframe
            // Pass the URL through the helper to force ?autoplay=1
            src={getAutoplayUrl(gameResult.video_link)} 
            title="Race Video"
            className="w-full h-full" 
            frameBorder="0"
            // Required for YouTube API to allow autoplay
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
            <div className="text-white text-xl">Video not available</div>
        )}
      </div>

      {/* Footer - Now guaranteed to stay visible because the video above can shrink */}
      <div className="flex-none flex justify-between items-center p-4 border-t border-gray-800 bg-[#1a1a1a] z-50 h-16">
        <div className="text-gray-400 text-sm animate-pulse flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>
            Watching race...
        </div>
        <button
          onClick={handleVideoComplete}
          disabled={!canSkipVideo}
          className={`px-5 py-2 rounded-full font-medium flex items-center gap-2 transition ${
            canSkipVideo 
              ? "bg-gray-700 hover:bg-gray-600 text-white cursor-pointer" 
              : "bg-gray-800 text-gray-500 cursor-not-allowed opacity-70"
          }`}
        >
          {/* Show the countdown dynamically */}
          {canSkipVideo ? (
            <>Continue <SkipForward size={18} /></>
          ) : (
            `Wait ${videoCountdown}s`
          )}
        </button>
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
        

      </div>

      <div className="p-4 border-t border-gray-800 bg-[#1a1a1a]">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-lg shadow-indigo-900/50"
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