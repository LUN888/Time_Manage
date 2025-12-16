// models/CalendarToken.js
import mongoose from "mongoose";

const calendarTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        provider: {
            type: String,
            default: "google",
        },
        accessToken: {
            type: String,
            required: true,
        },
        refreshToken: {
            type: String,
        },
        expiresAt: {
            type: Date,
        },
        scope: {
            type: String,
        },
    },
    { timestamps: true }
);

const CalendarToken = mongoose.model("CalendarToken", calendarTokenSchema);
export default CalendarToken;
