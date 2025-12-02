// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    grade: String,   // 年級
    major: String,   // 系所
    procrastinationSelfRating: Number, // 自評拖延程度（1-10）
  },
  { timestamps: true } // 自動加 createdAt, updatedAt
);

const User = mongoose.model("User", userSchema);
export default User;
