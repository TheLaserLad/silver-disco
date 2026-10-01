import express, { Request, Response } from "express";
import { CHAT_COPY, CHAT_LIMITS, expiryForDuration } from "../helpers/chat/chatRules";
import { requireDeskKey } from "../helpers/chat/deskAuth";
import { playerFromRequest } from "../helpers/chat/playerAuth";
import ChatReport from "../models/ChatReport";
import ChatSanction from "../models/ChatSanction";
import User from "../models/User";
import {
  getActiveSanction,
  playerHistory,
  publishChatMessage,
  pushSanctionStatus,
  recentMessages,
  reportMessage,
  serializeSanction,
} from "../service/chatService";

const router = express.Router();

async function requirePlayer(req: Request, res: Response) {
  const player = await playerFromRequest(req);
  if (!player) {
    res.status(401).json({ code: "not_signed_in", message: CHAT_COPY.notSignedIn });
    return null;
  }
  return player;
}

router.get("/history", async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const payload = await playerHistory(player);
    if (payload.banned) {
      res.status(403).json({
        code: "banned",
        message: CHAT_COPY.bannedPanel,
        sanction: payload.sanction,
        messages: [],
      });
      return;
    }
    res.json({ messages: payload.messages, sanction: payload.sanction });
  } catch (err) {
    console.error("chat history error:", err);
    res.status(500).json({ code: "send_failed", message: CHAT_COPY.sendFailed });
  }
});

router.get("/status", async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const sanction = serializeSanction(await getActiveSanction(player.id));
    res.json({
      username: player.username,
      userId: player.id,
      sanction,
      banned: sanction?.type === "ban",
    });
  } catch (err) {
    console.error("chat status error:", err);
    res.status(500).json({ message: CHAT_COPY.sendFailed });
  }
});

router.post("/send", async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const result = await publishChatMessage(player, req.body?.text);
    if (!result.ok) {
      const status = result.code === "banned" ? 403 : result.code === "muted" ? 403 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("chat send error:", err);
    res.status(500).json({ ok: false, code: "send_failed", message: CHAT_COPY.sendFailed });
  }
});

router.post("/report", async (req, res) => {
  try {
    const player = await requirePlayer(req, res);
    if (!player) return;
    const result = await reportMessage(player, req.body?.messageId);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, code: result.code, message: result.message });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("chat report error:", err);
    res.status(500).json({ ok: false, message: CHAT_COPY.sendFailed });
  }
});

router.get("/desk/messages", requireDeskKey, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || CHAT_LIMITS.deskRecent;
    const messages = await recentMessages(limit);
    res.json({ messages });
  } catch (err) {
    console.error("chat desk messages error:", err);
    res.status(500).json({ error: "Could not load messages." });
  }
});

router.get("/desk/reports", requireDeskKey, async (_req, res) => {
  try {
    const reports = await ChatReport.find({ status: "open" }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({
      reports: reports.map((report) => ({
        id: String(report._id),
        messageId: report.messageId,
        reporterId: report.reporterId,
        reporterUsername: report.reporterUsername,
        reportedUserId: report.reportedUserId,
        reportedUsername: report.reportedUsername,
        textSnapshot: report.textSnapshot,
        createdAt: new Date(report.createdAt).toISOString(),
      })),
    });
  } catch (err) {
    console.error("chat desk reports error:", err);
    res.status(500).json({ error: "Could not load reports." });
  }
});

router.get("/desk/sanctions", requireDeskKey, async (_req, res) => {
  try {
    const rows = await ChatSanction.find({ revokedAt: null }).sort({ createdAt: -1 }).limit(200).lean();
    const now = Date.now();
    const active = rows.filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > now);
    res.json({
      sanctions: active.map((row) => ({
        id: String(row._id),
        ...serializeSanction(row),
        userId: row.userId,
        createdBy: row.createdBy,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    });
  } catch (err) {
    console.error("chat desk sanctions error:", err);
    res.status(500).json({ error: "Could not load sanctions." });
  }
});

async function findPlayerByUsername(username: unknown) {
  if (typeof username !== "string" || !username.trim()) return null;
  const escaped = username.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user = await User.findOne({ username: new RegExp(`^${escaped}$`, "i") }).select("username").lean();
  if (!user) return null;
  return { id: String(user._id), username: (user.username || "").trim() || "Player" };
}

async function applySanction(options: {
  userId: string;
  username: string;
  type: "mute" | "ban";
  expiresAt: Date | null;
  createdBy: string;
  reportId?: string;
}) {
  const now = new Date();
  await ChatSanction.updateMany(
    { userId: options.userId, type: options.type, revokedAt: null },
    { $set: { revokedAt: now, revokedBy: options.createdBy } }
  );
  await ChatSanction.create({
    userId: options.userId,
    username: options.username,
    type: options.type,
    expiresAt: options.expiresAt,
    createdAt: now,
    createdBy: options.createdBy,
    revokedAt: null,
    reportId: options.reportId || null,
  });
  if (options.reportId) {
    await ChatReport.updateOne(
      { _id: options.reportId, status: "open" },
      {
        $set: {
          status: "actioned",
          resolution: options.type,
          resolvedAt: now,
          resolvedBy: options.createdBy,
        },
      }
    );
  }
  await pushSanctionStatus(options.userId);
}

router.post("/desk/mute", requireDeskKey, async (req, res) => {
  try {
    const player = await findPlayerByUsername(req.body?.username);
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }
    const duration = typeof req.body?.duration === "string" ? req.body.duration : "24h";
    const expiresAt = expiryForDuration(duration);
    if (expiresAt === undefined) {
      res.status(400).json({ error: "Duration must be 1h, 24h, 7d, or indefinite." });
      return;
    }
    const createdBy = typeof req.body?.createdBy === "string" && req.body.createdBy.trim()
      ? req.body.createdBy.trim()
      : "desk";
    await applySanction({
      userId: player.id,
      username: player.username,
      type: "mute",
      expiresAt,
      createdBy,
      reportId: typeof req.body?.reportId === "string" ? req.body.reportId : undefined,
    });
    res.json({ ok: true, userId: player.id, username: player.username, expiresAt });
  } catch (err) {
    console.error("chat mute error:", err);
    res.status(500).json({ error: "Could not mute." });
  }
});

router.post("/desk/ban", requireDeskKey, async (req, res) => {
  try {
    const player = await findPlayerByUsername(req.body?.username);
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }
    const createdBy = typeof req.body?.createdBy === "string" && req.body.createdBy.trim()
      ? req.body.createdBy.trim()
      : "desk";
    await applySanction({
      userId: player.id,
      username: player.username,
      type: "ban",
      expiresAt: null,
      createdBy,
      reportId: typeof req.body?.reportId === "string" ? req.body.reportId : undefined,
    });
    res.json({ ok: true, userId: player.id, username: player.username });
  } catch (err) {
    console.error("chat ban error:", err);
    res.status(500).json({ error: "Could not ban." });
  }
});

async function liftSanction(type: "mute" | "ban", username: unknown, revokedBy: string) {
  const player = await findPlayerByUsername(username);
  if (!player) return null;
  await ChatSanction.updateMany(
    { userId: player.id, type, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedBy } }
  );
  await pushSanctionStatus(player.id);
  return player;
}

router.post("/desk/unmute", requireDeskKey, async (req, res) => {
  try {
    const revokedBy = typeof req.body?.createdBy === "string" ? req.body.createdBy : "desk";
    const player = await liftSanction("mute", req.body?.username, revokedBy);
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }
    res.json({ ok: true, userId: player.id });
  } catch (err) {
    console.error("chat unmute error:", err);
    res.status(500).json({ error: "Could not unmute." });
  }
});

router.post("/desk/unban", requireDeskKey, async (req, res) => {
  try {
    const revokedBy = typeof req.body?.createdBy === "string" ? req.body.createdBy : "desk";
    const player = await liftSanction("ban", req.body?.username, revokedBy);
    if (!player) {
      res.status(404).json({ error: "Player not found." });
      return;
    }
    res.json({ ok: true, userId: player.id });
  } catch (err) {
    console.error("chat unban error:", err);
    res.status(500).json({ error: "Could not unban." });
  }
});

router.post("/desk/reports/dismiss", requireDeskKey, async (req, res) => {
  try {
    const reportId = req.body?.reportId;
    if (typeof reportId !== "string" || !reportId) {
      res.status(400).json({ error: "Report not found." });
      return;
    }
    const resolvedBy = typeof req.body?.createdBy === "string" ? req.body.createdBy : "desk";
    const updated = await ChatReport.updateOne(
      { _id: reportId, status: "open" },
      { $set: { status: "dismissed", resolution: "dismiss", resolvedAt: new Date(), resolvedBy } }
    );
    if (!updated.matchedCount) {
      res.status(404).json({ error: "Open report not found." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("chat dismiss error:", err);
    res.status(500).json({ error: "Could not dismiss." });
  }
});

router.post("/desk/refresh", requireDeskKey, async (req, res) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!userId) {
      res.status(400).json({ error: "userId required." });
      return;
    }
    await pushSanctionStatus(userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("chat refresh error:", err);
    res.status(500).json({ error: "Could not refresh." });
  }
});

export default router;
