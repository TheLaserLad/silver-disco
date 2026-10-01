import { Schema, model } from "mongoose";

/**
 * Chat-only discipline. A row never touches race play or the account.
 * type "mute" — can read, cannot send.
 * type "ban" — cannot use the room. Account can still race.
 * expiresAt null — until the desk unmutes / unbans.
 */
export interface ChatSanctionDoc {
  userId: string;
  username: string;
  type: "mute" | "ban";
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string;
  revokedAt: Date | null;
  revokedBy?: string | null;
  reportId?: string | null;
}

const schema = new Schema<ChatSanctionDoc>(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    type: { type: String, required: true, enum: ["mute", "ban"] },
    expiresAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
    createdBy: { type: String, required: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: null },
    reportId: { type: String, default: null },
  },
  { collection: "chat_sanctions" }
);

schema.index({ userId: 1, type: 1, revokedAt: 1 });

const ChatSanction = model<ChatSanctionDoc>("ChatSanction", schema, "chat_sanctions");

export default ChatSanction;
