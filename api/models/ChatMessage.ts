import { Schema, model } from "mongoose";

export interface ChatMessageDoc {
  room: string;
  userId: string;
  username: string;
  text: string;
  createdAt: Date;
}

const schema = new Schema<ChatMessageDoc>(
  {
    room: { type: String, required: true, default: "global", index: true },
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    text: { type: String, required: true, maxlength: 160 },
    createdAt: { type: Date, required: true, default: () => new Date(), index: true },
  },
  { collection: "chat_messages" }
);

schema.index({ room: 1, createdAt: -1 });

const ChatMessage = model<ChatMessageDoc>("ChatMessage", schema, "chat_messages");

export default ChatMessage;
