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
import OpenAI from "openai";


import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({origin: "http://localhost:5173",})
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

    const plans = await StudyPlan.find({
      userId: req.userId,
      date: { $gte: dayStart, $lt: dayEnd },
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
      `- ${new Date(s.startTime).toLocaleString()} (${s.durationMinutes}分鐘)${
        s.interrupted ? "，有分心，原因：" + s.interruptReasons.join("、") : ""
      }`
  )
  .join("\n")}

【學生的每日反思】
${reflections
  .map(
    (r) =>
      `- (${r.date.toISOString().slice(0, 10)}) 完成度 ${r.completionScore}%, 最拖延：${
        r.mostProcrastinatedTask
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
                `- ${new Date(s.startTime).toLocaleString()} (${s.durationMinutes} 分鐘)${
                  s.interrupted
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
                `- (${r.date.toISOString().slice(0, 10)}) 完成度 ${
                  r.completionScore
                }%，最拖延：${r.mostProcrastinatedTask}，做得好：${
                  r.whatWentWell
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
      "date": "YYYY-MM-DD"
    }
  ]
}

### 規則說明：

1. 任務拆分：
   - 「今天晚上八點讀兩小時資料庫，明天早上寫一小時演算法作業」要拆成兩個 plans。
   - 一句話裡如果有多個動作，就拆開來。

2. 日期與相對時間：
   - 「今天」          → 使用基準日期 ${baseDateStr}
   - 「明天」          → 基準日期 + 1 天
   - 「後天」          → 基準日期 + 2 天
   - 「這週六」        → 找到距離基準日最近、且在未來的星期六
   - 如果完全沒提日期 → 使用基準日期 ${baseDateStr}

3. 時段用來判斷「是不是今天」，但不用回傳具體時間：
   - 「早上、上午、早一點」   → 仍只需要 date，時間不用寫進 JSON
   - 「下午、傍晚」           → 一樣只需要 date
   - 「晚上、晚一點、睡前」   → 一樣只需要 date
   - 也就是說，你 **不用回傳具體時刻**，只要把任務分配到正確的日期就好。

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
    }));

    res.json({ plans: cleanedPlans });
  } catch (err) {
    console.error("AI parse plans error:", err);
    res.status(500).json({ error: "AI 解析學習計畫失敗" });
  }
});

// ----------------------------- AI 自動排程 區塊 ----------------------------//
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

    // 1. 取出這一天的計畫（這裡先不管 status，全部排進來）
    const plans = await StudyPlan.find({
      userId,
      date: { $gte: dayStart, $lt: dayEnd },
    }).sort({ priority: 1 });

    if (plans.length === 0) {
      return res.status(400).json({ error: "這一天沒有可以排程的計畫" });
    }

    // 2. 取得最近 7 天的專注紀錄
    const sevenDaysAgo = new Date(dayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sessions = await StudySession.find({
      userId,
      startTime: { $gte: sevenDaysAgo, $lt: dayEnd },
    }).sort({ startTime: 1 });

    const plansText = plans
      .map(
        (p, idx) =>
          `${idx + 1}. [${p.priority}] ${p.title}（科目：${
            p.subject || "未填"
          }，預估 ${p.estimatedMinutes || 60} 分鐘，id=${p._id})`
      )
      .join("\n");

    const sessionsText =
      sessions.length === 0
        ? "沒有紀錄"
        : sessions
            .map((s) => {
              const d = new Date(s.startTime);
              return `${d.toISOString().slice(0, 10)} ${
                d.toTimeString().slice(0, 5)
              }，${s.durationMinutes || 0} 分鐘${
                s.interrupted
                  ? "，有分心（" + (s.interruptReasons || []).join("、") + ")"
                  : ""
              }`;
            })
            .join("\n");

    const prompt = `
你是一個「時間管理教練 + 排程助手」，要幫學生安排「${dayStr}」這一天的學習計畫。

### 當天待排程的任務：
${plansText}

### 最近 7 天的專注紀錄（用來估計最適合讀書的時段）：
${sessionsText}

請幫我產生「一天的學習時段安排」，用 JSON 格式回覆：

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

1. 先排 priority 為 must，再來 should，最後 nice。
2. 一個任務可以拆成多個時段（例如 120 分鐘 → 2 個 60 分鐘 block）。
3. 避免連續超過 90 分鐘不休息。
4. 參考最近 7 天 session，若某些時段比較常讀書，就多排在那些時段。

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

    res.json({
      date: dayStr,
      schedule: parsed.schedule,
      summary: parsed.summary || "",
    });
  } catch (err) {
    console.error("AI auto-schedule error:", err);
    res.status(500).json({ error: "AI 自動排程失敗" });
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


