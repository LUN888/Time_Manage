// models/StudyPlan.js
import mongoose from "mongoose";

const studyPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // 之後登入再用
    title: { type: String, required: true },  // 任務名稱
    subject: String,                          // 科目
    estimatedMinutes: Number,                 // 預估時間（分鐘）
    priority: {
      type: String,
      enum: ["must", "should", "nice"],
      default: "should",
    },
    date: { type: Date, required: true },     // 開始日期
    endDate: { type: Date },                  // 結束日期（若為空則為單日事件）
    status: {
      type: String,
      enum: ["pending", "done", "postponed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const StudyPlan = mongoose.model("StudyPlan", studyPlanSchema);
export default StudyPlan;
