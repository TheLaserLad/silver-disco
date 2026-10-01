import { Namespace, Socket } from "socket.io";
import { CHAT_COPY, GLOBAL_ROOM } from "../helpers/chat/chatRules";
import { ChatPlayer, playerFromToken, tokenFromCookieHeader } from "../helpers/chat/playerAuth";
import { getActiveSanction, publishChatMessage, serializeSanction } from "../service/chatService";
import { setChatNamespace } from "./chatHub";

/**
 * Site-wide room. Additive beside /games and /leaderboard — this file must
 * not register handlers on the race namespace.
 *
 * STAMP-api-global-chat (when Gregg stamps). Marker: GLOBAL_CHAT_V1.
 */
export default function chatNamespace(nsp: Namespace): void {
  setChatNamespace(nsp);

  nsp.use(async (socket: Socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const fromAuth = typeof authToken === "string" ? authToken : undefined;
      const fromCookie = tokenFromCookieHeader(socket.handshake.headers.cookie);
      const player = await playerFromToken(fromAuth || fromCookie);
      if (!player) {
        next(new Error(CHAT_COPY.notSignedIn));
        return;
      }
      (socket.data as { player: ChatPlayer }).player = player;
      next();
    } catch (err) {
      console.error("chat auth error:", err);
      next(new Error(CHAT_COPY.notSignedIn));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const player = (socket.data as { player?: ChatPlayer }).player;
    if (!player) {
      socket.disconnect(true);
      return;
    }

    void (async () => {
      const sanction = serializeSanction(await getActiveSanction(player.id));
      socket.emit("chat:status", { sanction });
      if (sanction?.type !== "ban") {
        socket.join(GLOBAL_ROOM);
      }
    })().catch((err) => {
      console.error("chat connect error:", err);
    });

    socket.on("chat:send", async (body: { text?: unknown } | undefined, ack?: (payload: unknown) => void) => {
      try {
        const result = await publishChatMessage(player, body?.text);
        if (!result.ok) {
          ack?.({ ok: false, code: result.code, message: result.message, sanction: "sanction" in result ? result.sanction : undefined });
          return;
        }
        ack?.({ ok: true, message: result.message });
      } catch (err) {
        console.error("chat send error:", err);
        ack?.({ ok: false, code: "send_failed", message: CHAT_COPY.sendFailed });
      }
    });
  });
}
