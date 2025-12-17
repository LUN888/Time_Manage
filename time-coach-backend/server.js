// server.js
// server.js 最上面 imports 那區
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import User from "./models/User.js";
import StudyPlan from "./models/StudyPlan.js";
import StudySession from "./models/StudySession.js";
import { authRequired } from "./middleware/auth.js";
import Reflection from "./models/Reflection.js";
import CalendarToken from "./models/CalendarToken.js";
import DailySchedule from "./models/DailySchedule.js";
import OpenAI from "openai";
import { google } from "googleapis";


import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173", })
);

const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 4000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log("MONGODB_URI =", MONGODB_URI ? "loaded" : "NOT LOADED");

// 測試首頁
app.get("/", (req, res) => {
  res.send("Time Coach API is running");
});

//
// ---- StudyPlan 區塊 ----
//

// 新增學習計畫（需要登入）
app.post("/api/plans", authRequired, async (req, res) => {
  try {
    const { title, subject, estimatedMinutes, priority, date } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: "title 和 date 必填" });
    }

    const plan = await StudyPlan.create({
      userId: req.userId,
      title,
      subject,
      estimatedMinutes,
      priority,
      date,
    });

    res.status(201).json(plan);
  } catch (err) {
    console.error("Create plan error:", err);
    res.status(500).json({ error: "新增學習計畫失敗" });
  }
});

// 依日期查學習計畫（只看自己的）
app.get("/api/plans", authRequired, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ error: "請提供 date 查詢，例如 ?date=2025-12-01" });
    }

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // 查詢：
    // 1. 單日計畫：date 在查詢日期範圍內
    // 2. 跨日計畫：查詢日期落在 date ~ endDate 範圍內
    const plans = await StudyPlan.find({
      userId: req.userId,
      $or: [
        // 單日計畫或跨日計畫的開始日
        { date: { $gte: dayStart, $lt: dayEnd } },
        // 跨日計畫：查詢日期在 date ~ endDate 範圍內
        {
          date: { $lt: dayEnd },
          endDate: { $gte: dayStart }
        }
      ]
    }).sort({ createdAt: 1 });

    res.json(plans);
  } catch (err) {
    console.error("Get plans error:", err);
    res.status(500).json({ error: "取得學習計畫失敗" });
  }
});

// 取得單一學習計畫
app.get("/api/plans/:id", async (req, res) => {
  try {
    const plan = await StudyPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: "找不到這個學習計畫" });
    res.json(plan);
  } catch (err) {
    console.error("Get plan by id error:", err);
    res.status(500).json({ error: "取得學習計畫失敗" });
  }
});

// 更新學習計畫
app.patch("/api/plans/:id", async (req, res) => {
  try {
    const plan = await StudyPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!plan) return res.status(404).json({ error: "找不到這個學習計畫" });
    res.json(plan);
  } catch (err) {
    console.error("Update plan error:", err);
    res.status(500).json({ error: "更新學習計畫失敗" });
  }
});

// 刪除學習計畫
app.delete("/api/plans/:id", async (req, res) => {
  try {
    const plan = await StudyPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: "找不到這個學習計畫" });
    res.json({ message: "刪除成功" });
  } catch (err) {
    console.error("Delete plan error:", err);
    res.status(500).json({ error: "刪除學習計畫失敗" });
  }
});


// ---- StudySession 區塊 ----
// 新增專注紀錄（含 debug 訊息）
app.post("/api/sessions", authRequired, async (req, res) => {
  try {
    console.log("👉 Create session body:", req.body);
    console.log("👉 Current userId:", req.userId);

    const {
      planId,
      startTime,
      endTime,
      interrupted = false,
      interruptReasons = [],
      note,
    } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "startTime 和 endTime 必填" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = Math.round((end - start) / 1000 / 60);

    const session = await StudySession.create({
      userId: req.userId,
      planId: planId || undefined,
      startTime: start,
      endTime: end,
      durationMinutes,
      interrupted,
      interruptReasons,
      note,
    });

    res.status(201).json(session);
  } catch (err) {
    console.error("🔥 Create session error:", err);
    res.status(500).json({
      error: "新增專注紀錄失敗",
      details: err.message, // 暫時把訊息丟回去，方便 debug
    });
  }
});


// 結算今日專注：自動記錄未回報的時段為「有專心」
app.post("/api/sessions/settle", authRequired, async (req, res) => {
  try {
    const { date } = req.body;
    const userId = req.userId;

    // 預設今天
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // 取得該日排程
    const scheduleDoc = await DailySchedule.findOne({
      userId: userId,
      date: targetDate,
    });

    if (!scheduleDoc || !scheduleDoc.schedule || scheduleDoc.schedule.length === 0) {
      return res.status(400).json({ error: "當天沒有排程" });
    }

    // 取得該日已有的 sessions
    const dayStart = new Date(targetDate);
    const dayEnd = new Date(targetDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const existingSessions = await StudySession.find({
      userId: userId,
      startTime: { $gte: dayStart, $lt: dayEnd },
    });

    // 建立已記錄時段的 key 集合（用 start~end 來識別）
    const recordedKeys = new Set(
      existingSessions.map(s => {
        const startH = String(s.startTime.getHours()).padStart(2, '0');
        const startM = String(s.startTime.getMinutes()).padStart(2, '0');
        const endH = String(s.endTime.getHours()).padStart(2, '0');
        const endM = String(s.endTime.getMinutes()).padStart(2, '0');
        return `${startH}:${startM}~${endH}:${endM}`;
      })
    );

    // 找出未記錄的時段並建立 session
    const createdSessions = [];
    for (const block of scheduleDoc.schedule) {
      const key = `${block.start}~${block.end}`;
      if (!recordedKeys.has(key)) {
        // 未記錄，建立為「有專心」的 session
        const startTime = new Date(`${targetDate}T${block.start}:00`);
        const endTime = new Date(`${targetDate}T${block.end}:00`);
        const durationMinutes = Math.round((endTime - startTime) / 1000 / 60);

        const session = await StudySession.create({
          userId: userId,
          planId: block.planId || undefined,
          startTime: startTime,
          endTime: endTime,
          durationMinutes: durationMinutes,
          interrupted: false,
          interruptReasons: [],
          note: `${block.title}（自動結算）`,
        });

        createdSessions.push(session);
      }
    }

    res.status(201).json({
      message: `成功結算 ${createdSessions.length} 個專注時段`,
      sessions: createdSessions,
      totalBlocks: scheduleDoc.schedule.length,
      alreadyRecorded: scheduleDoc.schedule.length - createdSessions.length,
    });
  } catch (err) {
    console.error("Settle sessions error:", err);
    res.status(500).json({ error: "結算專注紀錄失敗" });
  }
});


// 查詢專注紀錄（只看自己的）
app.get("/api/sessions", authRequired, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        error: "請帶 from 與 to，例如 ?from=2025-12-01&to=2025-12-07",
      });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    const sessions = await StudySession.find({
      userId: req.userId,
      startTime: { $gte: fromDate, $lt: toDate },
    })
      .sort({ startTime: 1 })
      .populate("planId", "title subject");

    res.json(sessions);
  } catch (err) {
    console.error("Get sessions error:", err);
    res.status(500).json({ error: "取得專注紀錄失敗" });
  }
});



//----------------------------- Reflection 區塊 ----------------------------//
// 建立 / 更新今日反思：POST /api/reflections
app.post("/api/reflections", authRequired, async (req, res) => {
  try {
    const {
      date, // 可選，不帶就用今天
      completionScore,
      mostProcrastinatedTask,
      whatWentWell,
      whatToImprove,
    } = req.body;

    const baseDate = date ? new Date(date) : new Date();
    const dayStart = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate()
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // 同一天只保留一筆，存在就更新
    const reflection = await Reflection.findOneAndUpdate(
      {
        userId: req.userId,
        date: { $gte: dayStart, $lt: dayEnd },
      },
      {
        userId: req.userId,
        date: dayStart,
        completionScore,
        mostProcrastinatedTask,
        whatWentWell,
        whatToImprove,
      },
      { new: true, upsert: true }
    );

    res.status(201).json(reflection);
  } catch (err) {
    console.error("Create reflection error:", err);
    res.status(500).json({ error: "新增/更新反思失敗" });
  }
});

// 取得一段期間反思：GET /api/reflections?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get("/api/reflections", authRequired, async (req, res) => {
  try {
    let { from, to } = req.query;

    // 預設查最近 7 天
    if (!from || !to) {
      const today = new Date();
      const dayEnd = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );
      const dayStart = new Date(dayEnd);
      dayStart.setDate(dayStart.getDate() - 7);
      from = dayStart.toISOString().slice(0, 10);
      to = dayEnd.toISOString().slice(0, 10);
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    const reflections = await Reflection.find({
      userId: req.userId,
      date: { $gte: fromDate, $lt: toDate },
    }).sort({ date: -1 });

    res.json(reflections);
  } catch (err) {
    console.error("Get reflections error:", err);
    res.status(500).json({ error: "取得反思失敗" });
  }
});

// AI 解析反思總結：POST /api/reflections/parse
app.post("/api/reflections/parse", authRequired, async (req, res) => {
  try {
    const { text, date } = req.body;

    if (!text || text.trim().length < 5) {
      return res.status(400).json({ error: "請輸入今日總結（至少 5 個字）" });
    }

    const prompt = `你是一個專業的學習助手。請解析以下用戶的每日反思總結，並提取出結構化的資料。

用戶說：「${text}」

請根據用戶的描述，提取以下資訊：
1. completionScore：今日完成度（0-100 的數字，根據用戶描述估算）
2. mostProcrastinatedTask：今天最拖延或沒完成的事情（字串）
3. whatWentWell：今天做得不錯的地方（字串）
4. whatToImprove：明天想改善的地方或建議（字串）

請只回傳 JSON 格式，格式如下：
{
  "completionScore": 80,
  "mostProcrastinatedTask": "某個沒完成的任務",
  "whatWentWell": "完成了大部分任務",
  "whatToImprove": "留更多彈性時間"
}

如果用戶沒有提到某個欄位，請根據語境合理推測或留空字串。`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是一個專業的學習反思助手，只輸出 JSON 格式的回應。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    let content = completion.choices[0].message.content || "";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("AI reflection parse failed:", content);
      return res.status(500).json({ error: "AI 解析失敗，請重試" });
    }

    res.json({
      success: true,
      date: date || new Date().toISOString().slice(0, 10),
      reflection: {
        completionScore: parsed.completionScore ?? 70,
        mostProcrastinatedTask: parsed.mostProcrastinatedTask || "",
        whatWentWell: parsed.whatWentWell || "",
        whatToImprove: parsed.whatToImprove || "",
      },
      rawText: text,
    });
  } catch (err) {
    console.error("Parse reflection error:", err);
    res.status(500).json({ error: "AI 解析反思失敗" });
  }
});



//-----------------------------Auth 區塊----------------------------//
// 註冊：POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name, grade, major, procrastinationSelfRating } =
      req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, name 必填" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "這個 email 已被註冊" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      passwordHash,
      name,
      grade,
      major,
      procrastinationSelfRating,
    });

    res.status(201).json({
      _id: user._id,
      email: user.email,
      name: user.name,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "註冊失敗" });
  }
});


// 登入：POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email 和 password 必填" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "登入失敗" });
  }
});



//----------------------------- AI 教練 區塊 ----------------------------//
// AI 教練：POST /api/coach/chat
app.post("/api/coach/chat", authRequired, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message)
      return res.status(400).json({ error: "message 必填" });

    const userId = req.userId;

    // 取得最近 3 天計畫
    const today = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(today.getDate() - 3);

    const plans = await StudyPlan.find({
      userId,
      date: { $gte: threeDaysAgo }
    }).sort({ date: -1 });

    const sessions = await StudySession.find({
      userId,
      startTime: { $gte: threeDaysAgo }
    }).sort({ startTime: -1 });

    const reflections = await Reflection.find({
      userId,
      date: { $gte: threeDaysAgo }
    }).sort({ date: -1 });

    // 組 prompt
    const prompt = `
你是一位「AI 時間管理教練」，請用非常貼近學生生活、實用、具體的方式回應。
以下是學生最近 3 天的學習紀錄，請根據這些資料回覆「${message}」。

【學生的學習計畫】
${plans
        .map(
          (p) =>
            `- (${p.date.toISOString().slice(0, 10)}) ${p.title} [${p.priority}] 狀態：${p.status}`
        )
        .join("\n")}

【學生的專注紀錄】
${sessions
        .map(
          (s) =>
            `- ${new Date(s.startTime).toLocaleString()} (${s.durationMinutes}分鐘)${s.interrupted ? "，有分心，原因：" + s.interruptReasons.join("、") : ""
            }`
        )
        .join("\n")}

【學生的每日反思】
${reflections
        .map(
          (r) =>
            `- (${r.date.toISOString().slice(0, 10)}) 完成度 ${r.completionScore}%, 最拖延：${r.mostProcrastinatedTask
            }, 做得好：${r.whatWentWell}, 想改善：${r.whatToImprove}`
        )
        .join("\n")}

請給 3–5 個具體建議。語氣請保持友善、鼓勵、務實。
`;

    // 呼叫 GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是 AI 學習教練，專門改善拖延與學習動機。"
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });
  } catch (err) {
    console.error("AI coach error:", err);
    res.status(500).json({ error: "AI 教練回覆失敗" });
  }
});

// AI 教練：自動根據最近紀錄總結與建議  GET /api/coach/summary
app.get("/api/coach/summary", authRequired, async (req, res) => {
  try {
    const userId = req.userId;

    // 最近 7 天
    const today = new Date();
    const sevenDaysAgo = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 7
    );

    // 1. 抓最近 7 天的計畫 / 專注紀錄 / 反思
    const plans = await StudyPlan.find({
      userId,
      date: { $gte: sevenDaysAgo },
    }).sort({ date: -1 });

    const sessions = await StudySession.find({
      userId,
      startTime: { $gte: sevenDaysAgo },
    }).sort({ startTime: -1 });

    const reflections = await Reflection.find({
      userId,
      date: { $gte: sevenDaysAgo },
    }).sort({ date: -1 });

    // 2. 組成給 AI 的摘要
    const plansText =
      plans.length === 0
        ? "沒有紀錄"
        : plans
          .map(
            (p) =>
              `- (${p.date.toISOString().slice(0, 10)}) ${p.title} [${p.priority}] 狀態：${p.status}`
          )
          .join("\n");

    const sessionsText =
      sessions.length === 0
        ? "沒有紀錄"
        : sessions
          .map(
            (s) =>
              `- ${new Date(s.startTime).toLocaleString()} (${s.durationMinutes} 分鐘)${s.interrupted
                ? "，有分心，原因：" + (s.interruptReasons || []).join("、")
                : ""
              }`
          )
          .join("\n");

    const reflectionsText =
      reflections.length === 0
        ? "沒有紀錄"
        : reflections
          .map(
            (r) =>
              `- (${r.date.toISOString().slice(0, 10)}) 完成度 ${r.completionScore
              }%，最拖延：${r.mostProcrastinatedTask}，做得好：${r.whatWentWell
              }，想改善：${r.whatToImprove}`
          )
          .join("\n");

    const prompt = `
你是一位「AI 時間管理教練」，請根據學生最近 7 天的資料，主動提供分析與建議。

【最近 7 天的學習計畫】
${plansText}

【最近 7 天的專注紀錄】
${sessionsText}

【最近 7 天的每日反思】
${reflectionsText}

請用 JSON 回覆，格式一定要是：

{
  "summary": "用 3~5 句話總結這 7 天的整體情況（包括節奏、穩定度、拖延情況）",
  "strengths": [
    "條列學生做得好的地方，每點一句話，3 點以內"
  ],
  "improvements": [
    "條列學生可以改善的地方，每點一句話，3 點以內"
  ],
  "nextActions": [
    "給學生 2~4 個「下週可以嘗試的具體行動」，每點一句話，越具體越好"
  ]
}

注意：
- 一定要是合法 JSON，不能有註解、不能有多餘說明。
- 不要用 Markdown。
- 語氣友善、務實、像在跟高中或大學生說話。
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是學生的 AI 學習教練，只能輸出題目要求的 JSON 格式。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    let content = completion.choices[0].message.content || "";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from AI coach summary:", content);
      return res
        .status(500)
        .json({ error: "AI 回傳格式錯誤，無法解析總結結果" });
    }

    res.json(parsed);
  } catch (err) {
    console.error("AI coach summary error:", err);
    res.status(500).json({ error: "AI 教練總結失敗" });
  }
});







// ----------------------------- AI 解析學習計畫 區塊 ----------------------------//
// AI 解析學習計畫：POST /api/plans/parse
app.post("/api/plans/parse", authRequired, async (req, res) => {
  try {
    const { text, date } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "text 必填" });
    }

    const baseDate = date ? new Date(date) : new Date();
    const baseDateStr = baseDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const prompt = `
你是一個「學習計畫解析器」，使用者會用中文口語描述今天或未來幾天要做的事情，
包含讀書、寫作業、報告、專題，甚至也可能有玩遊戲、看影片這種休閒活動。

你的任務：把這段話拆成一到多個「學習/活動任務」，並只用 JSON 回覆。

### 回覆格式（務必完全符合）：
{
  "plans": [
    {
      "title": "任務名稱（簡短動詞開頭，例如：讀資料庫、寫物理作業、玩遊戲）",
      "subject": "科目或主題，若沒提到就用空字串",
      "estimatedMinutes": 整數（預估分鐘數，若沒提到預設 60）,
      "priority": "must" | "should" | "nice",
      "priority": "must" | "should" | "nice",
      "date": "YYYY-MM-DD",
      "time": "HH:MM" (若有具體時間，例如 "20:00"，否則 null)
    }
  ]
}

### 規則說明：

1. 任務拆分：
   - 「今天晚上八點讀兩小時資料庫，明天早上寫一小時演算法作業」要拆成兩個 plans。
   - 一句話裡如果有多個動作，就拆開來。

2. 日期與相對時間：
   - 「今天」          → 使用基準日期 ${baseDateStr}
   - 「今天晚上」      → 使用基準日期 ${baseDateStr}，並嘗試提取時間
   - 「明天」          → 基準日期 + 1 天
   - 「後天」          → 基準日期 + 2 天
   - 「這週六」        → 找到距離基準日最近、且在未來的星期六
   - 如果完全沒提日期 → 使用基準日期 ${baseDateStr}

3. time（具體時間）：
   - 如果使用者有提到具體時間（例如「晚上八點」、「8:00」、「20:00」、「下午三點」），請轉成 "HH:MM" 格式（24小時制）。
   - 如果沒提到具體時間，或者只是說「晚上」、「早上」但沒說幾點，請回傳 null 或空字串。
   - ⚠️ 重要：「下午」和「晚上」是 PM，需要加 12 小時！
   - 範例：
     - 「早上八點」 → time: "08:00"
     - 「上午十點」 → time: "10:00"
     - 「中午十二點」 → time: "12:00"
     - 「下午一點」 → time: "13:00"
     - 「下午兩點」 → time: "14:00"
     - 「下午三點半」 → time: "15:30"
     - 「下午五點」 → time: "17:00"
     - 「晚上六點」 → time: "18:00"
     - 「晚上八點」 → time: "20:00"
     - 「晚上十點」 → time: "22:00"
     - 「今天讀書」 → time: null


4. estimatedMinutes（預估時間）：
   - 有講「半小時」         → 30
   - 「一小時」             → 60
   - 「兩小時」             → 120
   - 「三十分鐘」           → 30
   - 沒特別講 → 60

5. priority（優先級）：
   - 有「一定要、必須、明天要交、很重要」   → "must"
   - 有「有空再、順便、看心情、打電動、玩遊戲」 → "nice"
   - 其他一般情況 → "should"

6. title / subject：
   - title：用「動詞 + 名詞」簡短描述，例如：
     - 「讀資料庫」、 「寫物理作業」、 「做專題報告」、「玩遊戲」
   - subject：如果有提科目或主題（資料庫、演算法、OS、英文、多益、TOEIC 等），填在這裡。
   - 如果是玩遊戲、看影片這種，subject 可以寫遊戲名稱或影片平台，沒有就空字串。

7. 僅回傳 JSON：
   - 不要出現任何多餘文字
   - 不要用 Markdown
   - 不要加註解

使用者的原始口語內容如下（請依規則解析）：

${text}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是一個嚴格遵守 JSON 格式輸出的任務解析器，只能輸出題目要求的 JSON。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    let content = completion.choices[0].message.content || "";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from AI:", content);
      return res.status(500).json({ error: "AI 回傳格式錯誤，無法解析" });
    }

    if (!parsed.plans || !Array.isArray(parsed.plans)) {
      return res
        .status(400)
        .json({ error: "AI 沒有給出有效的 plans 陣列" });
    }

    const cleanedPlans = parsed.plans.map((p) => ({
      title: String(p.title || "").trim(),
      subject: p.subject != null ? String(p.subject) : "",
      estimatedMinutes: Number.isFinite(Number(p.estimatedMinutes))
        ? Number(p.estimatedMinutes)
        : 60,
      priority:
        p.priority === "must" || p.priority === "nice" ? p.priority : "should",
      date: (p.date || baseDateStr).slice(0, 10),
      time: p.time || null,
    }));

    // 合併 date 和 time
    const finalPlans = cleanedPlans.map(p => {
      let finalDate = p.date;
      if (p.time) {
        finalDate = `${p.date}T${p.time}:00`;
      }
      return {
        ...p,
        date: finalDate // 若有時間則為 YYYY-MM-DDTHH:MM:00，否則為 YYYY-MM-DD
      };
    });

    res.json({ plans: finalPlans });
  } catch (err) {
    console.error("AI parse plans error:", err);
    res.status(500).json({ error: "AI 解析學習計畫失敗" });
  }
});

// ----------------------------- AI 自動排程 區塊 ----------------------------//

// 取得已儲存的排程：GET /api/schedule?date=YYYY-MM-DD
app.get("/api/schedule", authRequired, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "請提供 date 參數" });
    }

    const schedule = await DailySchedule.findOne({
      userId: req.userId,
      date: date,
    });

    if (!schedule) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      date: schedule.date,
      schedule: schedule.schedule,
      summary: schedule.summary,
    });
  } catch (err) {
    console.error("Get schedule error:", err);
    res.status(500).json({ error: "取得排程失敗" });
  }
});

// AI 自動排程：POST /api/plans/auto-schedule
app.post("/api/plans/auto-schedule", authRequired, async (req, res) => {
  try {
    const { date } = req.body;
    const userId = req.userId;

    const baseDate = date ? new Date(date) : new Date();
    const dayStart = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate()
    );
    const dayEnd = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + 1
    );
    function formatDateYMDLocal(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    // 在 route 裡用：
    const dayStr = formatDateYMDLocal(dayStart);

    // 1. 取出這一天的計畫（包含跨日事件）
    const plans = await StudyPlan.find({
      userId,
      $or: [
        // 單日計畫
        { date: { $gte: dayStart, $lt: dayEnd } },
        // 跨日計畫：查詢日期在 date ~ endDate 範圍內
        {
          date: { $lt: dayEnd },
          endDate: { $gte: dayStart }
        }
      ]
    }).sort({ priority: 1 });

    if (plans.length === 0) {
      return res.status(400).json({ error: "這一天沒有可以排程的計畫" });
    }

    // ========== 新增：分離固定時間和彈性時間的計畫 ==========
    // 判斷計畫是否有指定時間（檢查 date 是否有非 00:00 的時間）
    function hasFixedTime(plan) {
      const d = new Date(plan.date);
      return d.getHours() !== 0 || d.getMinutes() !== 0;
    }

    const fixedPlans = plans.filter(hasFixedTime);
    const flexiblePlans = plans.filter(p => !hasFixedTime(p));

    // 將固定時間計畫轉換成排程區塊
    const fixedScheduleBlocks = fixedPlans.map(p => {
      const startDate = new Date(p.date);
      const endDate = new Date(startDate.getTime() + (p.estimatedMinutes || 60) * 60 * 1000);
      return {
        planId: p._id.toString(),
        title: p.title,
        start: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
        end: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
        note: "使用者指定時間"
      };
    });

    // 如果沒有彈性計畫，直接回傳固定計畫
    if (flexiblePlans.length === 0) {
      // 按開始時間排序
      fixedScheduleBlocks.sort((a, b) => a.start.localeCompare(b.start));

      // 儲存到資料庫
      await DailySchedule.findOneAndUpdate(
        { userId: userId, date: dayStr },
        {
          userId: userId,
          date: dayStr,
          schedule: fixedScheduleBlocks,
          summary: "所有計畫都有指定時間，已按時間排列。",
        },
        { upsert: true, new: true }
      );

      return res.json({
        date: dayStr,
        schedule: fixedScheduleBlocks,
        summary: "所有計畫都有指定時間，已按時間排列。"
      });
    }

    // 2. 取得最近 7 天的專注紀錄
    const sevenDaysAgo = new Date(dayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sessions = await StudySession.find({
      userId,
      startTime: { $gte: sevenDaysAgo, $lt: dayEnd },
    }).sort({ startTime: 1 });

    // 只傳彈性計畫給 AI
    const flexiblePlansText = flexiblePlans
      .map(
        (p, idx) =>
          `${idx + 1}. [${p.priority}] ${p.title}（科目：${p.subject || "未填"
          }，預估 ${p.estimatedMinutes || 60} 分鐘，id=${p._id})`
      )
      .join("\n");

    // 產生已佔用時段文字
    const occupiedSlotsText = fixedScheduleBlocks.length === 0
      ? "無"
      : fixedScheduleBlocks
        .map(b => `${b.start}~${b.end}：${b.title}`)
        .join("\n");

    const sessionsText =
      sessions.length === 0
        ? "沒有紀錄"
        : sessions
          .map((s) => {
            const d = new Date(s.startTime);
            return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)
              }，${s.durationMinutes || 0} 分鐘${s.interrupted
                ? "，有分心（" + (s.interruptReasons || []).join("、") + ")"
                : ""
              }`;
          })
          .join("\n");

    const prompt = `
你是一個「時間管理教練 + 排程助手」，要幫學生安排「${dayStr}」這一天的學習計畫。

### ⚠️ 已佔用的時段（使用者已指定時間，不可覆蓋）：
${occupiedSlotsText}

### 待排程的任務（需要你安排時間）：
${flexiblePlansText}

### 最近 7 天的專注紀錄（用來估計最適合讀書的時段）：
${sessionsText}

請幫我產生「彈性任務的學習時段安排」，用 JSON 格式回覆：

{
  "schedule": [
    {
      "planId": "對應上面任務的 id（必填）",
      "title": "任務名稱",
      "start": "HH:mm",   // 24 小時制
      "end": "HH:mm",     // 24 小時制
      "note": "簡短說明為什麼排在這個時段，例如：你通常這個時段專注最好"
    }
  ],
  "summary": "用中文給學生 2~4 句總結與提醒。"
}

### 排程原則：

1. **絕對不能與已佔用時段重疊！**
2. 先排 priority 為 must，再來 should，最後 nice。
3. 一個任務可以拆成多個時段（例如 120 分鐘 → 2 個 60 分鐘 block）。
4. 避免連續超過 90 分鐘不休息。
5. 參考最近 7 天 session，若某些時段比較常讀書，就多排在那些時段。

請只回覆 JSON，不要加入任何解釋文字或 Markdown。
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是一個專業的學習排程教練，只能輸出題目要求的 JSON 格式。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    });

    let content = completion.choices[0].message.content || "";
    content = content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```json/i, "").replace(/```/g, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error from AI auto-schedule:", content);
      return res
        .status(500)
        .json({ error: "AI 排程回傳格式錯誤，無法解析" });
    }

    if (!parsed.schedule || !Array.isArray(parsed.schedule)) {
      return res
        .status(400)
        .json({ error: "AI 沒有給出有效的 schedule 陣列" });
    }

    // ========== 合併固定時間和 AI 排程 ==========
    const allScheduleBlocks = [...fixedScheduleBlocks, ...parsed.schedule];
    // 按開始時間排序
    allScheduleBlocks.sort((a, b) => a.start.localeCompare(b.start));

    // ========== 儲存排程到資料庫 ==========
    await DailySchedule.findOneAndUpdate(
      { userId: userId, date: dayStr },
      {
        userId: userId,
        date: dayStr,
        schedule: allScheduleBlocks,
        summary: parsed.summary || "",
      },
      { upsert: true, new: true }
    );

    res.json({
      date: dayStr,
      schedule: allScheduleBlocks,
      summary: parsed.summary || "",
    });
  } catch (err) {
    console.error("AI auto-schedule error:", err);
    res.status(500).json({ error: "AI 自動排程失敗" });
  }
});


//-----------------------卡片刪除功能
// DELETE /api/plans/:id
app.delete("/api/plans/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    await Plan.deleteOne({ _id: id, userId: req.user.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "刪除失敗" });
  }
});



// ------------------------------- Google Calendar 整合區塊 ----------------------------//

// Google OAuth2 設定
console.log("🔐 Google OAuth Config Check:");
console.log("  GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...` : "❌ NOT SET");
console.log("  GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 8)}... (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : "❌ NOT SET");
console.log("  GOOGLE_REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI || "❌ NOT SET");

// 檢查 secret 是否有隱藏字元
if (process.env.GOOGLE_CLIENT_SECRET) {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const hasWhitespace = /\s/.test(secret);
  const hasQuotes = /["']/.test(secret);
  if (hasWhitespace) console.log("  ⚠️ WARNING: Client secret contains whitespace!");
  if (hasQuotes) console.log("  ⚠️ WARNING: Client secret contains quotes!");
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
];

// 取得 Google OAuth 授權連結
app.get("/api/calendar/google/auth-url", authRequired, (req, res) => {
  try {
    const state = req.userId; // 將 userId 存入 state，回調時用
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: CALENDAR_SCOPES,
      state: state,
      prompt: "consent", // 強制顯示同意畫面以取得 refresh_token
    });
    res.json({ url: authUrl });
  } catch (err) {
    console.error("Generate auth URL error:", err);
    res.status(500).json({ error: "無法產生授權連結" });
  }
});

// Google OAuth 回調處理
app.get("/api/calendar/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = state;

    if (!code || !userId) {
      return res.status(400).send("授權失敗：缺少必要參數");
    }

    // 用 code 交換 tokens
    const { tokens } = await oauth2Client.getToken(code);

    // 計算過期時間
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // 儲存或更新 token
    await CalendarToken.findOneAndUpdate(
      { userId: userId },
      {
        userId: userId,
        provider: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: expiresAt,
        scope: tokens.scope,
      },
      { upsert: true, new: true }
    );

    // 重導向回前端（成功頁面）
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/calendar?connected=true`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/calendar?error=auth_failed`);
  }
});

// 檢查用戶是否已連結 Google Calendar
app.get("/api/calendar/google/status", authRequired, async (req, res) => {
  try {
    const token = await CalendarToken.findOne({
      userId: req.userId,
      provider: "google",
    });

    if (!token) {
      return res.json({ connected: false });
    }

    // 檢查是否過期
    const isExpired = token.expiresAt && new Date() > token.expiresAt;

    res.json({
      connected: true,
      expiresAt: token.expiresAt,
      isExpired: isExpired,
    });
  } catch (err) {
    console.error("Check calendar status error:", err);
    res.status(500).json({ error: "檢查連結狀態失敗" });
  }
});

// 取得用戶的所有日曆清單
app.get("/api/calendar/google/calendars", authRequired, async (req, res) => {
  try {
    const token = await CalendarToken.findOne({
      userId: req.userId,
      provider: "google",
    });

    if (!token) {
      return res.status(401).json({ error: "請先連結 Google Calendar" });
    }

    oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.calendarList.list();

    const calendars = (response.data.items || []).map((cal) => ({
      id: cal.id,
      name: cal.summary || cal.id,
      description: cal.description || "",
      backgroundColor: cal.backgroundColor,
      primary: cal.primary || false,
    }));

    res.json({ calendars });
  } catch (err) {
    console.error("Get calendar list error:", err);
    res.status(500).json({ error: "取得日曆清單失敗" });
  }
});

// 取得 Google Calendar 事件（支援選擇特定日曆）
app.get("/api/calendar/google/events", authRequired, async (req, res) => {
  try {
    const token = await CalendarToken.findOne({
      userId: req.userId,
      provider: "google",
    });

    if (!token) {
      return res.status(401).json({ error: "請先連結 Google Calendar" });
    }

    // 設置 credentials
    oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });

    // 如果 token 過期，嘗試刷新
    if (token.expiresAt && new Date() > token.expiresAt && token.refreshToken) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        token.accessToken = credentials.access_token;
        token.expiresAt = new Date(credentials.expiry_date);
        await token.save();
        oauth2Client.setCredentials(credentials);
      } catch (refreshErr) {
        console.error("Refresh token error:", refreshErr);
        return res.status(401).json({ error: "授權已過期，請重新連結" });
      }
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // 取得參數
    const { from, to, calendarId } = req.query;
    const targetCalendarId = calendarId || "primary";

    const timeMin = from
      ? new Date(from).toISOString()
      : new Date().toISOString();
    const timeMax = to
      ? new Date(to).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: targetCalendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events = (response.data.items || []).map((event) => ({
      id: event.id,
      calendarId: targetCalendarId,
      title: event.summary || "（無標題）",
      description: event.description || "",
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      isAllDay: !event.start.dateTime,
      location: event.location || "",
    }));

    res.json({ events });
  } catch (err) {
    console.error("Get calendar events error:", err);
    res.status(500).json({ error: "取得行事曆事件失敗" });
  }
});

// 匯入 Google Calendar 事件為學習計畫
app.post("/api/calendar/import", authRequired, async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "請提供要匯入的事件" });
    }

    const createdPlans = [];

    for (const event of events) {
      const startDate = new Date(event.start);
      let endDate = event.end ? new Date(event.end) : null;

      // 計算預估時間（分鐘）
      let estimatedMinutes = 60; // 預設 60 分鐘
      if (endDate) {
        estimatedMinutes = Math.round((endDate - startDate) / 1000 / 60);
        if (estimatedMinutes <= 0) estimatedMinutes = 60;
        if (estimatedMinutes > 480) estimatedMinutes = 480; // 最多 8 小時（單日）
      }

      // 判斷是否為跨日事件（超過 1 天）
      const isMultiDay = endDate &&
        (endDate.getTime() - startDate.getTime()) > 24 * 60 * 60 * 1000;

      // 跨日事件：只保留日期，不保留時間（讓 AI 排程）
      let planDate = startDate;
      let dailyMinutes = estimatedMinutes;
      if (isMultiDay) {
        planDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        // 每日建議 60-240 分鐘（隨機）
        dailyMinutes = Math.floor(Math.random() * (240 - 60 + 1)) + 60;
      }

      const plan = await StudyPlan.create({
        userId: req.userId,
        title: event.title || "從行事曆匯入",
        subject: event.subject || "",
        estimatedMinutes: dailyMinutes,
        priority: event.priority || "should",
        date: planDate,
        endDate: isMultiDay ? endDate : null, // 只有跨日事件才存 endDate
        status: "pending",
      });

      createdPlans.push(plan);
    }

    res.status(201).json({
      message: `成功匯入 ${createdPlans.length} 個學習計畫`,
      plans: createdPlans,
    });
  } catch (err) {
    console.error("Import calendar events error:", err);
    res.status(500).json({ error: "匯入失敗" });
  }
});

// 取消連結 Google Calendar
app.delete("/api/calendar/google/disconnect", authRequired, async (req, res) => {
  try {
    await CalendarToken.deleteOne({
      userId: req.userId,
      provider: "google",
    });
    res.json({ message: "已取消連結 Google Calendar" });
  } catch (err) {
    console.error("Disconnect calendar error:", err);
    res.status(500).json({ error: "取消連結失敗" });
  }
});


// ------------------------------- 伺服器啟動與 MongoDB 連線 區塊 ----------------------------//
// 連線 MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });


