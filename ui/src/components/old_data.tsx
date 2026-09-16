"use client";

import PointsDistribution from "./pointsbar";
import Crown1 from "../assets/crown.png";
import Medal_start1 from "../assets/medalstar.png";
import Medal1 from "../assets/medal.png";
import clock from "../assets/Leading-icon.png";
import timer from "../assets/timer.png";
import ball5 from "../assets/5balls/05.png";
import hashtag from "../assets/hashtag.png";
import gift from "../assets/gift.png";
import FavoriteBalls from "./FavoriteBalls";
import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// 🟣 Weekly Points Graph (kept as you had it)
const WeeklyPointsTrend = ({ graphData }: { graphData: any[] }) => {
  return (
    <div className="w-full max-w-md bg-[#1c1c22] rounded-xl p-4 shadow-lg mt-6">
      <h3 className="text-white font-semibold text-lg mb-4">
        Weekly Points Trend
      </h3>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={graphData}
            margin={{
              top: 10,
              right: 10,
              left: -30,
              bottom: 0,
            }}
          >
            <CartesianGrid
              stroke="#333333"
              vertical={false}
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="name"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              domain={[0, "dataMax + 50"]}
              tickFormatter={(tick: number) => tick.toString()}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e1e24",
                border: "1px solid #444",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#ffffff" }}
              formatter={(value: number) => [`${value} Points`, ""]}
            />
            <Area
              type="monotone"
              dataKey="points"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.4}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 🟣 Performance Stats (kept logic)
const PerformanceStats = () => {
  const [stats, setStats] = useState({
    totalRaces: 0,
    totalPoints: 0,
    totalWins: 0,
    finishRate: 0,
    weeklyPoints: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/user/stats", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok || res.status === 200) {
          setStats({
            totalRaces: data.totalRaces ?? 0,
            totalPoints: data.totalPoints ?? 0,
            totalWins: data.totalWins ?? 0,
            finishRate: data.finishRate ?? 0,
            weeklyPoints: data.weeklyPoints ?? [],
          });
        } else {
          console.error("Failed to fetch stats:", data);
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-md text-center text-gray-400 mt-10">
        Loading your stats...
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h2 className="text-white font-semibold text-2xl mb-4">Stats</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-white mb-1">
            {stats.totalRaces}
          </p>
          <p className="text-sm text-gray-400">Total races</p>
        </div>
        <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-green-500 mb-1">
            {stats.totalPoints}
          </p>
          <p className="text-sm text-gray-400">Total points</p>
        </div>
        <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-blue-400 mb-1">
            {stats.totalWins}
          </p>
          <p className="text-sm text-gray-400">Number of wins</p>
        </div>
        <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
          <p className="text-4xl font-bold text-red-400 mb-1">
            {stats.finishRate}%
          </p>
          <p className="text-sm text-gray-400">Average finish rate</p>
        </div>
      </div>

      {/* Graph below stats (left as-is) */}
      <WeeklyPointsTrend graphData={stats.weeklyPoints} />

      <div className="w-full max-w-md mt-6">
        {/* This screen's stats predate pointsOverTime — renders all zeros.
            The live version of this component is data.tsx. */}
        <PointsDistribution pointsOverTime={{}} />
      </div>
      <div className="w-full max-w-md mt-6">
        <FavoriteBalls />
      </div>
    </div>
  );
};

// 🟣 Main Component — syntax fixed, icon references fixed, ball/hash placed correctly
export default function RaceHistory() {
  const [activeTab, setActiveTab] = useState("history");
  const [selectedDate, setSelectedDate] = useState("Today");
  const [showDateOptions, setShowDateOptions] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState("All");
  const [showGameTypeOptions, setShowGameTypeOptions] = useState(false);

  const dateOptions = [
    "Today",
    "Yesterday",
    "Last 7 days",
    "Last 30 days",
    "Last 90 days",
    "12 months",
    "All time",
    "Custom date",
  ];

  const gameTypeOptions = ["All", "Standard", "Eliminator"];

  const races = [
    {
      id: "#18092501",
      mode: "Standard",
      timeRange: "14:30 – 14:32",
      duration: "2:34",
      position: "3rd",
     // <-- ball in correct place (you asked for ball 7)
      topFinishers: [
        {
          name: "SpeedDemon",
          position: "1st",
          time: "2:44",
          ball: "Ball 12",
          icon: Crown1, // image import used directly
        },
        {
          name: "BallMaster",
          position: "2nd",
          time: "2:55",
          ball: "Ball 3",
          icon: Medal_start1,
        },
        {
          name: "You",
          position: "3rd",
          time: "3:05",
          ball: "Ball 7",
          icon: Medal1,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#121212] text-white p-4 md:p-8 flex flex-col items-center">
      {/* Tabs */}
      <div className="flex bg-[#1c1c22] rounded-xl p-1 mb-6 w-full max-w-md">
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            activeTab === "history" ? "bg-purple-600" : "text-gray-400"
          }`}
          onClick={() => setActiveTab("history")}
        >
          Race History
        </button>
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            activeTab === "performance" ? "bg-[#8b6fed]" : "text-gray-400"
          }`}
          onClick={() => setActiveTab("performance")}
        >
          Performance
        </button>
      </div>

      {activeTab === "history" && (
        <>
          {/* Race History Header */}
          
          <div className="w-full max-w-md mb-2">
            <h2 className="text-white font-semibold text-lg">Race history</h2>
          

          {/* Filters */}
          <div className="flex justify-between items-center w-full max-w-md bg-[#1c1c22] p-3 rounded-xl mb-5 relative">
            {/* Game Type Dropdown */}
            <div className="relative w-[48%]">
              <button
                onClick={() => setShowGameTypeOptions(!showGameTypeOptions)}
                className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
              >
                {selectedGameType}
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showGameTypeOptions && (
                <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
                  {gameTypeOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSelectedGameType(option);
                        setShowGameTypeOptions(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] transition ${
                        option === selectedGameType ? "bg-[#2b2b36]" : ""
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Dropdown */}
            <div className="relative w-[48%]">
              <button
                onClick={() => setShowDateOptions(!showDateOptions)}
                className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
              >
                {selectedDate}
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showDateOptions && (
                <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
                  {dateOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        if (option === "Custom date") {
                          const picker = document.createElement("input");
                          picker.type = "date";
                          picker.onchange = (e: any) =>
                            setSelectedDate(e.target.value);
                          picker.click();
                        } else {
                          setSelectedDate(option);
                        }
                        setShowDateOptions(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] rounded-xl transition"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Race Cards list */}
          <div className="w-full max-w-md space-y-4">
            {races.map((race, index) => (
              <div
                key={index}
                className="bg-[#121212] rounded-2xl p-4 border border-gray-800 shadow-lg"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white font-medium">{race.id}</span>
                  <span className="bg-[#1f1f1f] text-white text-xs px-2 py-1 rounded-lg">
                    {race.mode}
                  </span>
                </div>

                {/* 2x2 stat boxes */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm text-gray-300">
                  {/* Time range */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={clock}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-white text-sm">
                        {race.timeRange}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Time range</p>
                  </div>

                  {/* Duration */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={timer}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-white text-sm">
                        {race.duration}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Duration</p>
                  </div>

                  {/* Your position */}
                  <div className="flex flex-col items-start bg-[#121212] rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <img src={gift}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="font-semibold text-purple-400 text-sm">
                        {race.position}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Your position</p>
                  </div>

                  {/* Your ball: shows '#' and ball number 7 on right */}
                  <div className="flex items-center justify-between bg-[#121212] rounded-xl p-3">
                    <div>
                      <img src={hashtag}  alt="winner" className="w-5 h-5 object-contain" />
                      <p className="text-xs text-gray-500 mt-1">Your ball</p>
                    </div>
                    <div className="text-purple-400 font-semibold text-lg">
                    <img src={ball5}  alt="winner" className="w-5 h-5 object-contain" />
                    </div>
                  </div>
                </div>

                {/* Top 3 finishers */}
                <div>
                  <p className="text-gray-400 text-sm mb-2">Top 3 finishers</p>
                  <div className="space-y-2">
                    {race.topFinishers.map((f, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-[#121212] p-3 rounded-xl border border-gray-800"
                      >
                        <div>
                          <p className="text-white font-semibold text-sm">
                            {f.name}
                          </p>
                          <p className="text-xs">
                            <span className="text-purple-400 font-semibold">
                              {f.position} Position
                            </span>{" "}
                            <span className="text-gray-400">• {f.ball}</span>{" "}
                            <span className="text-gray-400">• {f.time}</span>
                          </p>
                        </div>

                        {/* show the imported icon image */}
                        <img
                          src={f.icon}
                          alt={`${f.name}-icon`}
                          className="w-6 h-6 object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
            ))}
          </div>
          </div>
        </>
      )}

      {activeTab === "performance" && <PerformanceStats />}
    </div>
  );
}








// "use client";

// import PointsDistribution from "./pointsbar";
// import Crown1 from "../assets/crown.png"
// import Medal_start1 from "../assets/medalstar.png"
// import Medal1 from "../assets/medal.png"
// import FavoriteBalls from "./FavoriteBalls";
// import { useState, useEffect } from "react";
// import {
//   Calendar,
//   Clock,
//   Award,
//   ChevronDown,
// } from "lucide-react";
// import {
//   AreaChart,
//   Area,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   ResponsiveContainer,
// } from "recharts";

// // 🟣 Weekly Points Graph (now accepts backend data)
// const WeeklyPointsTrend = ({ graphData }: { graphData: any[] }) => {
//   return (
//     <div className="w-full max-w-md bg-[#1c1c22] rounded-xl p-4 shadow-lg mt-6">
//       <h3 className="text-white font-semibold text-lg mb-4">
//         Weekly Points Trend
//       </h3>
//       <div style={{ width: "100%", height: 250 }}>
//         <ResponsiveContainer width="100%" height="100%">
//           <AreaChart
//             data={graphData}
//             margin={{
//               top: 10,
//               right: 10,
//               left: -30,
//               bottom: 0,
//             }}
//           >
//             <CartesianGrid
//               stroke="#333333"
//               vertical={false}
//               strokeDasharray="3 3"
//             />
//             <XAxis
//               dataKey="name"
//               stroke="#888888"
//               fontSize={12}
//               tickLine={false}
//               axisLine={false}
//             />
//             <YAxis
//               stroke="#888888"
//               fontSize={12}
//               tickLine={false}
//               axisLine={false}
//               domain={[0, "dataMax + 50"]}
//               tickFormatter={(tick: number) => tick.toString()}
//             />
//             <Tooltip
//               contentStyle={{
//                 backgroundColor: "#1e1e24",
//                 border: "1px solid #444",
//                 borderRadius: "8px",
//               }}
//               labelStyle={{ color: "#ffffff" }}
//               formatter={(value: number) => [`${value} Points`, ""]}
//             />
//             <Area
//               type="monotone"
//               dataKey="points"
//               stroke="#8b5cf6"
//               fill="#8b5cf6"
//               fillOpacity={0.4}
//               strokeWidth={2}
//             />
//           </AreaChart>
//         </ResponsiveContainer>
//       </div>
//     </div>
//   );
// };

// // 🟣 Performance Stats (dynamic from backend)
// const PerformanceStats = () => {
//   const [stats, setStats] = useState({
//     totalRaces: 0,
//     totalPoints: 0,
//     totalWins: 0,
//     finishRate: 0,
//     weeklyPoints: [],
//   });

//   const [loading, setLoading] = useState(true);

//  useEffect(() => {
//     async function fetchStats() {
//       try {
//         const res = await fetch("/api/user/stats", {
//           method: "GET",
//           credentials: "include",
//         });
//         const data = await res.json();
//         if (res.ok || res.status === 200) {
//           // Ensure 0 values are preserved
//           setStats({
//             totalRaces: data.totalRaces ?? 0,
//             totalPoints: data.totalPoints ?? 0,
//             totalWins: data.totalWins ?? 0,
//             finishRate: data.finishRate ?? 0,
//             weeklyPoints: data.weeklyPoints ?? [],
//           });
//         } else {
//           console.error("Failed to fetch stats:", data);
//         }
//       } catch (err) {
//         console.error("Error fetching stats:", err);
//       } finally {
//         setLoading(false);
//       }
//     }
//     fetchStats();
//   }, []);

//   if (loading) {
//     return (
//       <div className="w-full max-w-md text-center text-gray-400 mt-10">
//         Loading your stats...
//       </div>
//     );
//   }

//   return (
//     <div className="w-full max-w-md">
//       <h2 className="text-white font-semibold text-2xl mb-4">Stats</h2>
//       <div className="grid grid-cols-2 gap-4">
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-white mb-1">
//             {stats.totalRaces}
//           </p>
//           <p className="text-sm text-gray-400">Total races</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-green-500 mb-1">
//             {stats.totalPoints}
//           </p>
//           <p className="text-sm text-gray-400">Total points</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-blue-400 mb-1">
//             {stats.totalWins}
//           </p>
//           <p className="text-sm text-gray-400">Number of wins</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-red-400 mb-1">
//             {stats.finishRate}%
//           </p>
//           <p className="text-sm text-gray-400">Average finish rate</p>
//         </div>
//       </div>

//       {/* Graph below stats */}
//       <WeeklyPointsTrend graphData={stats.weeklyPoints} />

//       <div className="w-full max-w-md mt-6">
//         <PointsDistribution />
//       </div>
//       <div className="w-full max-w-md mt-6">
//         <FavoriteBalls />
//       </div>
//     </div>
//   );
// };

// // 🟣 Main Component
// export default function RaceHistory() {
//   const [activeTab, setActiveTab] = useState("history");
//   const [selectedDate, setSelectedDate] = useState("Today");
//   const [showDateOptions, setShowDateOptions] = useState(false);
//   const [selectedGameType, setSelectedGameType] = useState("All");
//   const [showGameTypeOptions, setShowGameTypeOptions] = useState(false);

//   const dateOptions = [
//     "Today",
//     "Yesterday",
//     "Last 7 days",
//     "Last 30 days",
//     "Last 90 days",
//     "12 months",
//     "All time",
//     "Custom date",
//   ];

//   const gameTypeOptions = ["All", "Standard", "Eliminator"];

//   const races = [
//     {
//       id: "#18092501",
//       mode: "Standard",
//       timeRange: "14:30 – 14:32",
//       duration: "2:34",
//       position: "3rd",
//       ball: "path to ball",
//       topFinishers: [
//         {
//           name: "SpeedDemon",
//           position: "1st",
//           time: "2:44",
//           ball: "2nd",
//           icon: {Crown1},
//         },
//         {
//           name: "BallMaster",
//           position: "2nd",
//           time: "2:55",
//           ball: "4th",
//           icon: {Medal_start1},
//         },
//         {
//           name: "You",
//           position: "3rd",
//           time: "3:05",
//           ball: "8th",
//           icon: {Medal1},
//         },
//       ],
//     },
//   ];

//   return (
//     <div className="min-h-screen bg-[#0b0b0f] text-white p-4 md:p-8 flex flex-col items-center">
//       {/* Tabs */}
//       <div className="flex bg-[#1c1c22] rounded-xl p-1 mb-6 w-full max-w-md">
//         <button
//           className={`flex-1 py-2 rounded-lg text-sm font-medium ${
//             activeTab === "history" ? "bg-purple-600" : "text-gray-400"
//           }`}
//           onClick={() => setActiveTab("history")}
//         >
//           Race History
//         </button>
//         <button
//           className={`flex-1 py-2 rounded-lg text-sm font-medium ${
//             activeTab === "performance" ? "bg-purple-600" : "text-gray-400"
//           }`}
//           onClick={() => setActiveTab("performance")}
//         >
//           Performance
//         </button>
//       </div>

//       {activeTab === "history" && (
//         <>
//           {/* Race History Section */}
//           <div className="w-full max-w-md mb-2">
//             <h2 className="text-white font-semibold text-lg">Race history</h2>
//           </div>

//           {/* Filters */}
//           <div className="flex justify-between items-center w-full max-w-md bg-[#1c1c22] p-3 rounded-xl mb-5 relative">
//             {/* Game Type Dropdown */}
//             <div className="relative w-[48%]">
//               <button
//                 onClick={() => setShowGameTypeOptions(!showGameTypeOptions)}
//                 className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
//               >
//                 {selectedGameType}
//                 <ChevronDown size={16} className="text-gray-400" />
//               </button>
//               {showGameTypeOptions && (
//                 <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
//                   {gameTypeOptions.map((option, index) => (
//                     <button
//                       key={index}
//                       onClick={() => {
//                         setSelectedGameType(option);
//                         setShowGameTypeOptions(false);
//                       }}
//                       className={`block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] transition ${
//                         option === selectedGameType ? "bg-[#2b2b36]" : ""
//                       }`}
//                     >
//                       {option}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>

//             {/* Date Dropdown */}
//             <div className="relative w-[48%]">
//               <button
//                 onClick={() => setShowDateOptions(!showDateOptions)}
//                 className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
//               >
//                 {selectedDate}
//                 <ChevronDown size={16} className="text-gray-400" />
//               </button>
//               {showDateOptions && (
//                 <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
//                   {dateOptions.map((option, index) => (
//                     <button
//                       key={index}
//                       onClick={() => {
//                         if (option === "Custom date") {
//                           const picker = document.createElement("input");
//                           picker.type = "date";
//                           picker.onchange = (e: any) =>
//                             setSelectedDate(e.target.value);
//                           picker.click();
//                         } else {
//                           setSelectedDate(option);
//                         }
//                         setShowDateOptions(false);
//                       }}
//                       className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] rounded-xl transition"
//                     >
//                       {option}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Race Cards */}
//           <div className="w-full max-w-md space-y-4">
//             {races.map((race, index) => (
//               <div
//                 key={index}
//                 className="bg-gradient-to-b from-[#181820] to-[#0e0e12] rounded-2xl p-4 border border-gray-800 shadow-lg"
//               >
//                 <div className="flex justify-between items-center mb-2">
//                   <span className="text-gray-300 font-medium">{race.id}</span>
//                   <span className="bg-[#2b2b36] text-gray-300 text-xs px-2 py-1 rounded-lg">
//                     {race.mode}
//                   </span>
//                 </div>

//                 <div className="flex flex-col gap-2 w-[360px] h-[158px]">
//                 {/* Header row */}
//                 <div className="flex flex-row justify-between items-center w-full h-[30px]">
//                     <div className="flex justify-center items-center gap-2 mx-auto text-[14px] font-medium text-[#F8F8F8]">
//                     Race Summary
//                     </div>
//                     <div className="flex justify-center items-center gap-1 mx-auto border border-[#333333] rounded-full px-3 py-1 text-[12px] text-[#F8F8F8]">
//                     Tag
//                     </div>
//                 </div>

//                 {/* Time and Duration */}
//                 <div className="flex flex-row gap-2 w-full h-[56px]">
//                     {/* Time Range */}
//                     <div className="flex flex-row items-center bg-[#121212] rounded-[12px] px-3 py-2 gap-3 w-[176px] h-[56px]">
//                     <Clock className="text-white w-5 h-5" />
//                     <div className="flex flex-col items-start">
//                         <p className="text-[14px] font-semibold text-[#F8F8F8] leading-[22px]">
//                         {race.timeRange}
//                         </p>
//                         <p className="text-[12px] font-normal text-[#767676] leading-[18px]">
//                         Time range
//                         </p>
//                     </div>
//                     </div>

//                     {/* Duration */}
//                     <div className="flex flex-row items-center bg-[#121212] rounded-[12px] px-3 py-2 gap-3 w-[176px] h-[56px]">
//                     <Calendar className="text-white w-5 h-5" />
//                     <div className="flex flex-col items-start">
//                         <p className="text-[14px] font-semibold text-[#F8F8F8] leading-[22px]">
//                         {race.duration}
//                         </p>
//                         <p className="text-[12px] font-normal text-[#767676] leading-[18px]">
//                         Duration
//                         </p>
//                     </div>
//                     </div>
//                 </div>

//                 {/* Position and Ball */}
//                 <div className="flex flex-row gap-2 w-full h-[56px]">
//                     {/* Position */}
//                     <div className="flex flex-row items-center bg-[#121212] rounded-[12px] px-3 py-2 gap-3 w-[176px] h-[56px]">
//                     <Award className="text-white w-5 h-5" />
//                     <div className="flex flex-col items-start">
//                         <p className="text-[14px] font-semibold text-[#F8F8F8] leading-[22px]">
//                         {race.position}
//                         </p>
//                         <p className="text-[12px] font-normal text-[#767676] leading-[18px]">
//                         Your Position
//                         </p>
//                     </div>
//                     </div>

//                     {/* Ball */}
//                     <div className="flex flex-row items-center bg-[#121212] rounded-[12px] px-3 py-2 gap-3 w-[176px] h-[56px]">
//                     <div className="w-5 h-5 rounded-[12px] bg-gradient-to-br from-purple-500 to-indigo-600"></div>
//                     <div className="flex flex-col items-start">
//                         <p className="text-[14px] font-semibold text-[#F8F8F8] leading-[22px]">
//                         {race.ball}
//                         </p>
//                         <p className="text-[12px] font-normal text-[#767676] leading-[18px]">
//                         Your Ball
//                         </p>
//                     </div>
//                     </div>
//                 </div>
//                 </div>

//                 <div>
//                   <p className="text-gray-400 text-sm mb-2">Top 3 finishers</p>
//                   <div className="space-y-2">
//                     {race.topFinishers.map((f, i) => (
//                       <div
//                         key={i}
//                         className="flex justify-between items-center bg-[#1a1a1f] p-3 rounded-xl border border-gray-800"
//                       >
//                         <div>
//                           <p className="text-white font-semibold text-sm">
//                             {f.name}
//                           </p>
//                           <p className="text-xs">
//                             <span className="text-purple-400 font-semibold">
//                               {f.position} Position
//                             </span>{" "}
//                             <span className="text-gray-400">• {f.ball}</span>
//                             <span className="text-gray-400">• {f.time}</span>
//                           </p>
//                         </div>
//                         <div>
//                         <img
//                             src={f.icon.Crown1 || f.icon.Medal_start1 || f.icon.Medal1}
//                             alt="icon"
//                             style={{ width: 24, height: 24 }}
//                         />
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </>
//       )}

//       {activeTab === "performance" && <PerformanceStats />}
//     </div>
//   );
// }














// "use client";

// import PointsDistribution from './pointsbar'; 
// import FavoriteBalls from './FavoriteBalls';

// import { useState } from "react";
// import {
//   Calendar,
//   Clock,
//   Award,
//   Trophy,
//   User,
//   ChevronDown,
// } from "lucide-react";
// import {
//   AreaChart,
//   Area,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   ResponsiveContainer,
// } from "recharts";

// // Sample graph data
// const data = [
//   { name: "Mon", points: 380 },
//   { name: "Tue", points: 395 },
//   { name: "Wed", points: 410 },
//   { name: "Thur", points: 435 },
//   { name: "Fri", points: 405 },
//   { name: "Sat", points: 445 },
//   { name: "Sun", points: 480 },
// ];

// // Weekly Points Graph Component
// const WeeklyPointsTrend = () => {
//   return (
//     <div className="w-full max-w-md bg-[#1c1c22] rounded-xl p-4 shadow-lg mt-6">
//       <h3 className="text-white font-semibold text-lg mb-4">
//         Weekly Points Trend
//       </h3>
//       <div style={{ width: "100%", height: 250 }}>
//         <ResponsiveContainer width="100%" height="100%">
//           <AreaChart
//             data={data}
//             margin={{
//               top: 10,
//               right: 10,
//               left: -30,
//               bottom: 0,
//             }}
//           >
//             <CartesianGrid
//               stroke="#333333"
//               vertical={false}
//               strokeDasharray="3 3"
//             />
//             <XAxis
//               dataKey="name"
//               stroke="#888888"
//               fontSize={12}
//               tickLine={false}
//               axisLine={false}
//             />
//             <YAxis
//               stroke="#888888"
//               fontSize={12}
//               tickLine={false}
//               axisLine={false}
//               domain={[100, 600]}
//               tickFormatter={(tick: number) => tick.toString()}
//             />
//             <Tooltip
//               contentStyle={{
//                 backgroundColor: "#1e1e24",
//                 border: "1px solid #444",
//                 borderRadius: "8px",
//               }}
//               labelStyle={{ color: "#ffffff" }}
//               formatter={(value: number) => [`${value} Points`, ""]}
//             />
//             <Area
//               type="monotone"
//               dataKey="points"
//               stroke="#8b5cf6"
//               fill="#8b5cf6"
//               fillOpacity={0.4}
//               strokeWidth={2}
//             />
//           </AreaChart>
//         </ResponsiveContainer>
//       </div>
//     </div>
//   );
// };

// // Performance Stats Component
// const PerformanceStats = () => {
//   return (
//     <div className="w-full max-w-md">
//       <h2 className="text-white font-semibold text-2xl mb-4">Stats</h2>
//       <div className="grid grid-cols-2 gap-4">
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-white mb-1">156</p>
//           <p className="text-sm text-gray-400">Total races</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-green-500 mb-1">847</p>
//           <p className="text-sm text-gray-400">Total points</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-blue-400 mb-1">140</p>
//           <p className="text-sm text-gray-400">Number of wins</p>
//         </div>
//         <div className="bg-[#1c1c22] rounded-xl p-5 flex flex-col items-center justify-center shadow-lg">
//           <p className="text-4xl font-bold text-red-400 mb-1">6.2%</p>
//           <p className="text-sm text-gray-400">Average finish rate</p>
//         </div>
//       </div>

//       {/* Graph added below Stats */}
//       <WeeklyPointsTrend />
      
//       <div className="w-full max-w-md mt-6"> 
//       <PointsDistribution />
//     </div>
//     <div className="w-full max-w-md mt-6"> 
//       <FavoriteBalls />
//     </div>
    
//     </div>
//   );
// };

// export default function RaceHistory() {
//   const [activeTab, setActiveTab] = useState("history");
//   const [selectedDate, setSelectedDate] = useState("Today");
//   const [showDateOptions, setShowDateOptions] = useState(false);
//   const [selectedGameType, setSelectedGameType] = useState("All");
//   const [showGameTypeOptions, setShowGameTypeOptions] = useState(false);

//   const dateOptions = [
//     "Today",
//     "Yesterday",
//     "Last 7 days",
//     "Last 30 days",
//     "Last 90 days",
//     "12 months",
//     "All time",
//     "Custom date",
//   ];

//   const gameTypeOptions = ["All", "Standard", "Eliminator"];

//   const races = [
//     {
//       id: "#18092501",
//       mode: "Standard",
//       timeRange: "14:30 – 14:32",
//       duration: "2:34",
//       position: "3rd",
//       topFinishers: [
//         {
//           name: "SpeedDemon",
//           position: "1st",
//           time: "2:44",
//           ball: "2nd",
//           icon: <Trophy className="text-yellow-400" size={16} />,
//         },
//         {
//           name: "BallMaster",
//           position: "2nd",
//           time: "2:55",
//           ball: "4th",
//           icon: <Award className="text-gray-400" size={16} />,
//         },
//         {
//           name: "You",
//           position: "3rd",
//           time: "3:05",
//           ball: "8th",
//           icon: <User className="text-purple-500" size={16} />,
//         },
//       ],
//     },
//     {
//       id: "#18092502",
//       mode: "Eliminator",
//       timeRange: "14:30 – 14:31",
//       duration: "2:34",
//       position: "3rd",
//       topFinishers: [
//         {
//           name: "SpeedDemon",
//           position: "1st",
//           time: "2:34",
//           ball: "15th",
//           icon: <Trophy className="text-yellow-400" size={16} />,
//         },
//         {
//           name: "BallMaster",
//           position: "2nd",
//           time: "2:35",
//           ball: "8th",
//           icon: <Award className="text-gray-400" size={16} />,
//         },
//         {
//           name: "You",
//           position: "3rd",
//           time: "2:36",
//           ball: "5th",
//           icon: <User className="text-purple-500" size={16} />,
//         },
//       ],
//     },
//   ];

//   return (
//     <div className="min-h-screen bg-[#0b0b0f] text-white p-4 md:p-8 flex flex-col items-center">
//       {/* Tabs */}
//       <div className="flex bg-[#1c1c22] rounded-xl p-1 mb-6 w-full max-w-md">
//         <button
//           className={`flex-1 py-2 rounded-lg text-sm font-medium ${
//             activeTab === "history" ? "bg-purple-600" : "text-gray-400"
//           }`}
//           onClick={() => setActiveTab("history")}
//         >
//           Race History
//         </button>
//         <button
//           className={`flex-1 py-2 rounded-lg text-sm font-medium ${
//             activeTab === "performance" ? "bg-purple-600" : "text-gray-400"
//           }`}
//           onClick={() => setActiveTab("performance")}
//         >
//           Performance
//         </button>
//       </div>

//       {activeTab === "history" && (
//         <>
//           {/* Race History Section */}
//           <div className="w-full max-w-md mb-2">
//             <h2 className="text-white font-semibold text-lg">Race history</h2>
//           </div>

//           {/* Filters */}
//           <div className="flex justify-between items-center w-full max-w-md bg-[#1c1c22] p-3 rounded-xl mb-5 relative">
//             {/* Game Type Dropdown */}
//             <div className="relative w-[48%]">
//               <button
//                 onClick={() => setShowGameTypeOptions(!showGameTypeOptions)}
//                 className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
//               >
//                 {selectedGameType}
//                 <ChevronDown size={16} className="text-gray-400" />
//               </button>
//               {showGameTypeOptions && (
//                 <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
//                   {gameTypeOptions.map((option, index) => (
//                     <button
//                       key={index}
//                       onClick={() => {
//                         setSelectedGameType(option);
//                         setShowGameTypeOptions(false);
//                       }}
//                       className={`block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] transition ${
//                         option === selectedGameType ? "bg-[#2b2b36]" : ""
//                       }`}
//                     >
//                       {option}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>

//             {/* Date Dropdown */}
//             <div className="relative w-[48%]">
//               <button
//                 onClick={() => setShowDateOptions(!showDateOptions)}
//                 className="bg-[#2b2b36] text-gray-300 text-sm px-3 py-2 rounded-full w-full text-left flex justify-between items-center"
//               >
//                 {selectedDate}
//                 <ChevronDown size={16} className="text-gray-400" />
//               </button>
//               {showDateOptions && (
//                 <div className="absolute top-12 left-0 w-full bg-[#1c1c22] border border-gray-700 rounded-2xl shadow-lg z-10 overflow-hidden">
//                   {dateOptions.map((option, index) => (
//                     <button
//                       key={index}
//                       onClick={() => {
//                         if (option === "Custom date") {
//                           const picker = document.createElement("input");
//                           picker.type = "date";
//                           picker.onchange = (e: any) =>
//                             setSelectedDate(e.target.value);
//                           picker.click();
//                         } else {
//                           setSelectedDate(option);
//                         }
//                         setShowDateOptions(false);
//                       }}
//                       className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2b2b36] rounded-xl transition"
//                     >
//                       {option}
//                     </button>
//                   ))}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Race Cards */}
//           <div className="w-full max-w-md space-y-4">
//             {races.map((race, index) => (
//               <div
//                 key={index}
//                 className="bg-gradient-to-b from-[#181820] to-[#0e0e12] rounded-2xl p-4 border border-gray-800 shadow-lg"
//               >
//                 <div className="flex justify-between items-center mb-2">
//                   <span className="text-gray-300 font-medium">{race.id}</span>
//                   <span className="bg-[#2b2b36] text-gray-300 text-xs px-2 py-1 rounded-lg">
//                     {race.mode}
//                   </span>
//                 </div>

//                 <div className="grid grid-cols-2 gap-2 mb-4 text-sm text-gray-300">
//                   <div className="flex flex-col items-center bg-[#1c1c22] rounded-xl p-2">
//                     <Clock size={16} className="text-purple-400 mb-1" />
//                     <p>{race.timeRange}</p>
//                     <p className="text-xs text-gray-500">Time range</p>
//                   </div>

//                   <div className="flex flex-col items-center bg-[#1c1c22] rounded-xl p-2">
//                     <Calendar size={16} className="text-purple-400 mb-1" />
//                     <p>{race.duration}</p>
//                     <p className="text-xs text-gray-500">Duration</p>
//                   </div>

//                   <div className="flex flex-col items-center bg-[#1c1c22] rounded-xl p-2">
//                     <Award size={16} className="text-purple-400 mb-1" />
//                     <p className="text-purple-400 font-semibold">
//                       {race.position}
//                     </p>
//                     <p className="text-xs text-gray-500">Your position</p>
//                   </div>

//                   <div className="flex flex-col items-center bg-[#1c1c22] rounded-xl p-2">
//                     <div className="w-4 h-4 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full mb-1 shadow-md"></div>
//                     <p className="text-purple-400 font-semibold">
//                       {race.position}
//                     </p>
//                     <p className="text-xs text-gray-500">Your Ball</p>
//                   </div>
//                 </div>

//                 <div>
//                   <p className="text-gray-400 text-sm mb-2">Top 3 finishers</p>
//                   <div className="space-y-2">
//                     {race.topFinishers.map((f, i) => (
//                       <div
//                         key={i}
//                         className="flex justify-between items-center bg-[#1a1a1f] p-3 rounded-xl border border-gray-800"
//                       >
//                         <div>
//                           <p className="text-white font-semibold text-sm">
//                             {f.name}
//                           </p>
//                           <p className="text-xs">
//                             <span className="text-purple-400 font-semibold">
//                               {f.position} Position
//                             </span>{" "}
//                             <span className="text-gray-400">• {f.ball}</span>
//                             <span className="text-gray-400">• {f.time}</span>
//                           </p>
//                         </div>
//                         <div>{f.icon}</div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </>
//       )}

//       {activeTab === "performance" && <PerformanceStats />}
//     </div>
//   );
// }






