import mongoose, { Document, Schema } from "mongoose";

export interface SessionDocument extends Document {
    userId: mongoose.Types.ObjectId,
    slugId: string,
    title: string | null,
    boxId: string,
    repoUrl: string,
    repoName: string,
    defaultBranch: string,
    branchName: string | null,
    repoInitializedAt: Date | null,
    createdAt: Date,
    updatedAt: Date
}

const sessionSchema = new Schema<SessionDocument>({
    userId: {
        type: mongoose.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        default: null
    },
    slugId: {
        type: String,
        required: true,
        unique: true
    },
    boxId: {
        type: String,
        required: true
    },
    repoUrl: {
        type: String,
        required: true
    },
    repoName: {
        type: String,
        required: true,
    },
    defaultBranch: {
        type: String,
        required: true,
    },
    branchName: {
        type: String,
        default: null,
    },
    repoInitializedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true
});

const SessionModel = mongoose.model<SessionDocument>("Session", sessionSchema);
export default SessionModel;