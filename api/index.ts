import dotenv from "dotenv";
dotenv.config({ path: __dirname + "/../.env" });

import express, { Express, Request } from "express";
import { readFileSync } from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import path from "path";
import Routes from "./routes";
import socketServer from "./socketServer";
import unrestricted from "./routes/unrestricted";
import session from "express-session";
import { Server } from "socket.io";
import leaderboardRoutes from "./routes/leaderboardRoutes";
import userRoutes from "./routes/userRoutes";
import chatRoutes from "./routes/chat";




const app: Express = express();
const port = process.env.PORT || 5000;

// Connect MongoDB
mongoose
  .connect(`${process.env.MONGODB_URL}`)
  .then(() => console.log("✅ Database connected."))
  .catch((err) => console.error("❌ MongoDB error:", err));

if (process.env.CLIENT_URL) {
  app.use(
    cors<Request>({
      origin: process.env.CLIENT_URL,
      credentials: true,
    })
  );
} else {
  throw "❌ Invalid application settings: CLIENT_URL missing";
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.environment === "Production",
      sameSite: "lax",
    },
  })
);

app.use(express.static(path.join(process.cwd(), "uploads/")));
app.use("/unrestricted", unrestricted);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/user", userRoutes);
app.use("/chat", chatRoutes);


for (let i = 0; i < Routes.length; i++) {
  app.use(Routes[i]);
}

// for (let i = 0; i < Routes.length; i++) {
//   const route = Routes[i];
//   app.use(route);
// }

// --- SERVER SETUP ---
if (!process.env.environment) throw "❌ Invalid application settings (environment missing)";

if (process.env.environment === "Development") {
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: "*" } }); // ✅ Attach io correctly

  socketServer(server); // your existing socketServer logic
  const gameNamespace = io.of("/game");
 // pass io to games

  server.listen(port, () => {
    console.log(`🚀 Server running on port ${port} (Development mode)`);
  });

} else if (process.env.environment === "Production") {
  if (!process.env.TLS || !process.env.TLS_KEY) throw "❌ Missing TLS certificates";

  const key = readFileSync(process.env.TLS_KEY);
  const cert = readFileSync(process.env.TLS);

  const server = createHttpsServer({ key, cert, rejectUnauthorized: false }, app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://pinballrace.com",
      "https://www.pinballrace.com",
      "https://pinballrace.com:8080",
      "http://localhost:3000" // (optional, for local dev)
    ],
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
  },
  transports: ["websocket", "polling"],
});
  socketServer(server);
  const gameNamespace = io.of("/game");


  server.listen(port, () => {
    console.log(`🚀 Server running on port ${port} (Production mode)`);
  });
} else {
  throw "❌ Invalid environment value";
}


















