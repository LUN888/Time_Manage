// models/StudySession.js
import mongoose from "mongoose";

const studySessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "StudyPlan" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: Number,
    interrupted: { type: Boolean, default: false },
    interruptReasons: [String],
    note: String,
  },
  { timestamps: true }
);

const StudySession = mongoose.model("StudySession", studySessionSchema);
export default StudySession;
