import mongoose, { Document, Schema } from "mongoose";

export interface MessageDocument extends Document {
    sessionId: mongoose.Types.ObjectId,
    id: string,
    role: "user" | "assistant" | "system";
    parts: any; // JSON - store whatever AI SDK sends
    createdAt: Date,
    updatedAt: Date
}

const messageSchema = new Schema<MessageDocument>({
    sessionId: {
        type: mongoose.Types.ObjectId,
        ref: "Session",
        required: true,
        index: true
    },
    id: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ["user", "assistant", "system"],
        required: true
    },
    parts: {
        type: Schema.Types.Mixed, // Can store JSON
        required: true
    }
}, {
    timestamps: true
});

const MessageModel = mongoose.model<MessageDocument>("Message", messageSchema);
export default MessageModel;