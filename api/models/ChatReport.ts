import { Schema, model } from "mongoose";

export type ChatReportStatus = "open" | "dismissed" | "actioned";

export interface ChatReportDoc {
  messageId: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  textSnapshot: string;
  status: ChatReportStatus;
  createdAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolution?: "dismiss" | "mute" | "ban" | null;
}

const schema = new Schema<ChatReportDoc>(
  {
    messageId: { type: String, required: true },
    reporterId: { type: String, required: true },
    reporterUsername: { type: String, required: true },
    reportedUserId: { type: String, required: true },
    reportedUsername: { type: String, required: true },
    textSnapshot: { type: String, required: true },
    status: { type: String, required: true, default: "open", index: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
    resolution: { type: String, default: null },
  },
  { collection: "chat_reports" }
);

schema.index({ messageId: 1, reporterId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

const ChatReport = model<ChatReportDoc>("ChatReport", schema, "chat_reports");

export default ChatReport;
