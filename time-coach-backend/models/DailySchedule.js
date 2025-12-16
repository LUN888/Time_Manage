// models/DailySchedule.js
import mongoose from "mongoose";

const scheduleBlockSchema = new mongoose.Schema({
    planId: { type: String },
    title: { type: String, required: true },
    start: { type: String, required: true }, // HH:mm
    end: { type: String, required: true },   // HH:mm
    note: { type: String },
}, { _id: false });

const dailyScheduleSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        date: {
            type: String,  // YYYY-MM-DD 格式
            required: true
        },
        schedule: [scheduleBlockSchema],
        summary: { type: String },
    },
    { timestamps: true }
);

// 確保每個用戶每天只有一個排程
dailyScheduleSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailySchedule = mongoose.model("DailySchedule", dailyScheduleSchema);
export default DailySchedule;
