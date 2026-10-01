import { CHAT_COPY, CHAT_LIMITS, GLOBAL_ROOM, RateBuckets, dominantSanction, takeSendSlot, validateMessageText } from "../helpers/chat/chatRules";
import { ChatPlayer } from "../helpers/chat/playerAuth";
import ChatMessage from "../models/ChatMessage";
import ChatReport from "../models/ChatReport";
import ChatSanction, { ChatSanctionDoc } from "../models/ChatSanction";
import { getChatNamespace } from "../socket_namespaces/chatHub";

const sendBuckets: RateBuckets = new Map();

export type PublicMessage = {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
};

export type PublicSanction = {
  type: "mute" | "ban";
  expiresAt: string | null;
  username: string;
};

type SanctionRow = ChatSanctionDoc & { _id?: unknown };

function serializeMessage(doc: {
  _id: unknown;
  userId: string;
  username: string;
  text: string;
  createdAt: Date | string;
}): PublicMessage {
  return {
    id: String(doc._id),
    userId: doc.userId,
    username: doc.username,
    text: doc.text,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export function serializeSanction(row: SanctionRow | null): PublicSanction | null {
  if (!row) return null;
  return {
    type: row.type,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    username: row.username,
  };
}

export async function getActiveSanction(userId: string): Promise<SanctionRow | null> {
  const rows = await ChatSanction.find({
    userId,
    revokedAt: null,
  }).lean();
  return dominantSanction(rows as SanctionRow[]);
}

async function pruneRoom(): Promise<void> {
  const count = await ChatMessage.countDocuments({ room: GLOBAL_ROOM });
  if (count <= CHAT_LIMITS.retainMessages) return;
  const cutoff = await ChatMessage.find({ room: GLOBAL_ROOM })
    .sort({ createdAt: -1 })
    .skip(CHAT_LIMITS.retainMessages - 1)
    .limit(1)
    .select("createdAt")
    .lean();
  const createdAt = cutoff[0]?.createdAt;
  if (!createdAt) return;
  await ChatMessage.deleteMany({ room: GLOBAL_ROOM, createdAt: { $lt: createdAt } });
}

export async function publishChatMessage(player: ChatPlayer, raw: unknown) {
  const sanction = await getActiveSanction(player.id);
  if (sanction?.type === "ban") {
    return {
      ok: false as const,
      code: "banned" as const,
      message: CHAT_COPY.bannedPanel,
      sanction: serializeSanction(sanction),
    };
  }
  if (sanction?.type === "mute") {
    return {
      ok: false as const,
      code: "muted" as const,
      message: CHAT_COPY.mutedComposer,
      sanction: serializeSanction(sanction),
    };
  }

  const validated = validateMessageText(raw);
  if (!validated.ok && validated.code !== "blocked" && validated.code !== "links") {
    return validated;
  }

  if (!takeSendSlot(player.id, Date.now(), sendBuckets)) {
    return { ok: false as const, code: "rate_limited" as const, message: CHAT_COPY.rateLimited };
  }
  if (!validated.ok) return validated;

  const doc = await ChatMessage.create({
    room: GLOBAL_ROOM,
    userId: player.id,
    username: player.username,
    text: validated.text,
    createdAt: new Date(),
  });
  await pruneRoom();

  const message = serializeMessage(doc);
  getChatNamespace()?.to(GLOBAL_ROOM).emit("chat:message", message);
  return { ok: true as const, message };
}

export async function recentMessages(limit: number): Promise<PublicMessage[]> {
  const safe = Math.min(Math.max(limit, 1), CHAT_LIMITS.deskRecent);
  const docs = await ChatMessage.find({ room: GLOBAL_ROOM })
    .sort({ createdAt: -1 })
    .limit(safe)
    .lean();
  return docs.reverse().map((doc) => serializeMessage(doc));
}

export async function playerHistory(player: ChatPlayer) {
  const sanction = serializeSanction(await getActiveSanction(player.id));
  if (sanction?.type === "ban") {
    return { banned: true as const, sanction, messages: [] as PublicMessage[] };
  }
  const messages = await recentMessages(CHAT_LIMITS.historyOnOpen);
  return { banned: false as const, sanction, messages };
}

export async function reportMessage(player: ChatPlayer, messageId: unknown) {
  const sanction = await getActiveSanction(player.id);
  if (sanction?.type === "ban") {
    return { ok: false as const, status: 403, code: "banned" as const, message: CHAT_COPY.bannedPanel };
  }
  if (typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false as const, status: 400, code: "not_found" as const, message: "Message not found." };
  }
  const msg = await ChatMessage.findById(messageId.trim()).lean();
  if (!msg) {
    return { ok: false as const, status: 404, code: "not_found" as const, message: "Message not found." };
  }
  if (msg.userId === player.id) {
    return {
      ok: false as const,
      status: 400,
      code: "own_message" as const,
      message: "You can’t report your own message.",
    };
  }
  try {
    await ChatReport.create({
      messageId: String(msg._id),
      reporterId: player.id,
      reporterUsername: player.username,
      reportedUserId: msg.userId,
      reportedUsername: msg.username,
      textSnapshot: msg.text,
      status: "open",
      createdAt: new Date(),
    });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      return {
        ok: false as const,
        status: 409,
        code: "already_reported" as const,
        message: CHAT_COPY.alreadyReported,
      };
    }
    throw err;
  }
  return { ok: true as const, status: 200 };
}

export async function pushSanctionStatus(userId: string): Promise<void> {
  const nsp = getChatNamespace();
  if (!nsp) return;
  const sanction = serializeSanction(await getActiveSanction(userId));
  const sockets = await nsp.fetchSockets();
  for (const socket of sockets) {
    const player = (socket.data as { player?: ChatPlayer }).player;
    if (!player || player.id !== userId) continue;
    if (sanction?.type === "ban") {
      socket.leave(GLOBAL_ROOM);
    } else {
      socket.join(GLOBAL_ROOM);
    }
    socket.emit("chat:status", { sanction });
  }
}
