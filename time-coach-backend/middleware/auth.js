// middleware/auth.js
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "缺少授權 token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // 把 userId 存在 req 上，後面 route 可以用
    req.userId = payload.userId;
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ error: "無效或過期的 token" });
  }
}
