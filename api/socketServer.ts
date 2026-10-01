import { IncomingMessage, Server, ServerResponse } from "http";
import { Server as socketioServer } from "socket.io";
import leaderboardNamespace from "./socket_namespaces/leaderboard";
import chatNamespace from "./socket_namespaces/chat";

export default function (
  server: Server<typeof IncomingMessage, typeof ServerResponse>
) {
  const io = new socketioServer(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  });

  // Race namespace. Handlers live in the deployed games socket — do not replace
  // that file and do not attach chat traffic here.
  const gamesNsp = io.of("/games");
  void gamesNsp;

  // Leaderboard namespace
  const leaderboardNsp = io.of("/leaderboard");
  leaderboardNamespace(leaderboardNsp);

  // GLOBAL_CHAT_V1 — site-wide room, signed-in players only.
  // Stamp later: STAMP-api-global-chat. Additive; leaves /games alone.
  const chatNsp = io.of("/chat");
  chatNamespace(chatNsp);
}










// import { IncomingMessage, Server, ServerResponse } from "http";
// import { Server as socketioServer } from "socket.io";
// import games from "./socket_namespaces/games";

// export default function (
//   server: Server<typeof IncomingMessage, typeof ServerResponse>
// ) {
//   const io = new socketioServer(server, {
//     cors: {
//       origin: process.env.CLIENT_URL,
//       credentials: true,
//     },
//   });

//   const raceConnections = io.of("/games");
//   games(raceConnections);
// }


