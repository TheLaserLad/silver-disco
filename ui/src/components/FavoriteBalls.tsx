import React from "react";

import Ball1 from "../assets/5balls/1.svg";
import Ball2 from "../assets/5balls/2.svg";
import Ball3 from "../assets/5balls/3.svg";
import Ball4 from "../assets/5balls/4.svg";
import Ball5 from "../assets/5balls/5.svg";
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
// get the list of favorite balls from props or data
interface FavoriteBallsProps {
  // Optional because the destructure below supplies a default — declaring it
  // required made that default unreachable and broke callers that rely on it.
  balls?: number[];

}const FavoriteBalls: React.FC<FavoriteBallsProps> = ({ balls = [1, 2, 3, 4, 5] }) => {

  const ballColors: Record<number, string> = {
    1: "bg-yellow-500",
    2: "bg-blue-600",
    3: "bg-red-600",
    4: "bg-purple-600",
    5: "bg-orange-500",
  };

  return (
    <div className="w-full max-w-md bg-[#121212] rounded-xl p-4 shadow-lg">
      <h3 className="text-white font-semibold text-xl mb-1">
        Favorite Ball Numbers
      </h3>
      <p className="text-gray-400 text-sm mb-4">
        Your most frequently selected ball numbers
      </p>

      <div className="flex space-x-3">
        {balls.map((number) => (
          <div
            key={number}
            className={`w-6 h-6 rounded-full flex items-center justify-center ${ballColors[number]}`}
          >
            <img
              src={importedBalls[number - 1]}
    className="w-full h-full object-contain select-none"
    style={{
      imageRendering: "auto",
      WebkitMaskImage: "radial-gradient(circle, white 99%, transparent 100%)",
      maskImage: "radial-gradient(circle, white 99%, transparent 100%)",
    }}  
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FavoriteBalls;
