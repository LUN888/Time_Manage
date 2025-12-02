// models/Reflection.js
import mongoose from "mongoose";

const reflectionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    completionScore: Number,          // 0–100
    mostProcrastinatedTask: String,
    whatWentWell: String,
    whatToImprove: String,
    coachSummary: String,             // 之後 AI 用
  },
  { timestamps: true }
);

const Reflection = mongoose.model("Reflection", reflectionSchema);
export default Reflection;
