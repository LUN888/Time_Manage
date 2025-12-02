import { useEffect, useState, useRef } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

function formatDateToYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionSectionRef = useRef(null);
  const sessionStartInputRef = useRef(null);

  const today = new Date();
  const todayStr = formatDateToYMD(today);
  const tomorrowStr = formatDateToYMD(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  );

  // ---- 計畫相關 ----
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState("");
  const [plansLoading, setPlansLoading] = useState(true);

  const [planForm, setPlanForm] = useState({
    title: "",
    subject: "",
    estimatedMinutes: 60,
    priority: "must",
    date: todayStr,
  });
  const [creatingPlan, setCreatingPlan] = useState(false);

  // 語音 & AI 解析
  const [voiceText, setVoiceText] = useState("");
  const [parsedPlans, setParsedPlans] = useState([]); // AI 解析出的任務
  const [parsingPlans, setParsingPlans] = useState(false);

  // AI 自動排程的結果
  const [autoSchedule, setAutoSchedule] = useState(null); // { date, schedule, summary }
  const [autoScheduling, setAutoScheduling] = useState(false);

  // ---- 專注紀錄相關 ----
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [sessionForm, setSessionForm] = useState({
    startTime: `${todayStr}T20:00`,
    endTime: `${todayStr}T20:30`,
    interrupted: false,
    interruptReasons: "",
    note: "",
  });
  const [creatingSession, setCreatingSession] = useState(false);

  // ---- 讀取資料 ----
  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      const res = await api.get(`/api/plans?date=${todayStr}`);
      setPlans(res.data);
      setPlansError("");
    } catch (err) {
      console.error(err);
      setPlansError("取得今日計畫失敗");
    } finally {
      setPlansLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setSessionsLoading(true);
      const res = await api.get(
        `/api/sessions?from=${todayStr}&to=${tomorrowStr}`
      );
      setSessions(res.data);
      setSessionsError("");
    } catch (err) {
      console.error(err);
      setSessionsError("取得今日專注紀錄失敗");
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchPlans();
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  // ---- 計畫表單處理 ----
  const handlePlanChange = (e) => {
    const { name, value } = e.target;
    setPlanForm((f) => ({ ...f, [name]: value }));
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planForm.title) return;
    setCreatingPlan(true);
    try {
      await api.post("/api/plans", {
        ...planForm,
        estimatedMinutes: Number(planForm.estimatedMinutes),
      });
      setPlanForm((f) => ({ ...f, title: "" }));
      await fetchPlans();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "新增計畫失敗");
    } finally {
      setCreatingPlan(false);
    }
  };

  // 🎤 語音轉文字功能
  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("你的瀏覽器不支援語音輸入（建議使用 Chrome）");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      console.log("語音辨識結果：", text);
      setVoiceText(text);

      // 先填到任務名稱欄位
      setPlanForm((prev) => ({
        ...prev,
        title: text,
      }));
    };

    recognition.onerror = (e) => {
      console.error("語音辨識錯誤：", e.error);
    };

    recognition.start();
  };

  // 🧠 呼叫後端 AI 解析語音/文字成多個任務
  const handleParseVoiceToPlans = async () => {
    const textToParse = voiceText || planForm.title;
    if (!textToParse) {
      alert("請先用語音或文字輸入內容再解析");
      return;
    }
    setParsingPlans(true);
    try {
      const res = await api.post("/api/plans/parse", {
        text: textToParse,
        date: todayStr,
      });
      setParsedPlans(res.data.plans || []);
      if (!res.data.plans || res.data.plans.length === 0) {
        alert("AI 沒有解析出任何任務，請換種說法試試看。");
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "AI 解析失敗");
    } finally {
      setParsingPlans(false);
    }
  };

  // ✅ 確認 AI 解析出的任務並全部新增
  const handleConfirmParsedPlans = async () => {
    if (!parsedPlans.length) return;
    try {
      for (const p of parsedPlans) {
        await api.post("/api/plans", {
          title: p.title,
          subject: p.subject,
          estimatedMinutes: p.estimatedMinutes,
          priority: p.priority,
          date: p.date,
        });
      }
      setParsedPlans([]);
      setVoiceText("");
      await fetchPlans();
      alert("已根據 AI 解析結果建立所有任務！");
    } catch (err) {
      console.error(err);
      alert("建立任務時發生錯誤，請稍後再試");
    }
  };

  // ---- 專注紀錄處理 ----
  const handleSessionChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSessionForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setCreatingSession(true);
    try {
      const startISO = new Date(sessionForm.startTime).toISOString();
      const endISO = new Date(sessionForm.endTime).toISOString();

      await api.post("/api/sessions", {
        startTime: startISO,
        endTime: endISO,
        interrupted: sessionForm.interrupted,
        interruptReasons: sessionForm.interruptReasons
          ? sessionForm.interruptReasons.split("，").map((s) => s.trim())
          : [],
        note: sessionForm.note,
      });

      await fetchSessions();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "新增專注紀錄失敗");
    } finally {
      setCreatingSession(false);
    }
  };

  // 🧠 呼叫 AI 自動排程今天
  const handleAutoScheduleToday = async () => {
    setAutoScheduling(true);
    try {
      const res = await api.post("/api/plans/auto-schedule", {
        date: todayStr,
      });
      setAutoSchedule(res.data); // { date, schedule, summary }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "AI 自動排程失敗");
    } finally {
      setAutoScheduling(false);
    }
  };

  // ✅ 在 AI 排程的某一個時段上，紀錄「這段有分心」
  const handleMarkDistractedOnBlock = async (block) => {
    if (!autoSchedule) return;

    const reasonStr = window.prompt(
      `你在「${block.start} ~ ${block.end}：${block.title}」這段時間的分心原因是什麼？\n可以用「，」分隔，例如：手機，滑 IG，聊天`
    );

    if (!reasonStr) return;

    const reasons = reasonStr
      .split("，")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const startLocal = new Date(`${autoSchedule.date}T${block.start}:00`);
      const endLocal = new Date(`${autoSchedule.date}T${block.end}:00`);

      await api.post("/api/sessions", {
        planId: block.planId || undefined,
        startTime: startLocal.toISOString(),
        endTime: endLocal.toISOString(),
        interrupted: true,
        interruptReasons: reasons,
        note: block.title || "AI 排程時段",
      });

      await fetchSessions();
      alert("已記錄這段時間的分心情況！");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "紀錄分心時發生錯誤");
    }
  };
//-------功能：捲動到專注紀錄表單並聚焦開始時間欄位-------
    const scrollToSessionForm = () => {
    if (sessionSectionRef.current) {
      sessionSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    setTimeout(() => {
      if (sessionStartInputRef.current) {
        sessionStartInputRef.current.focus();
      }
    }, 400);
  };





  // ------------ 渲染頁面 ------------
  if (!user) return null;

  const totalFocusMinutes = sessions.reduce(
    (sum, s) => sum + (s.durationMinutes || 0),
    0
  );

  return (
    <div className="dashboard-shell">
      {/* header */}
            <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Hi,</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>
            {user.name}
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            AI 學習時間助理 · 深色專注模式
          </div>
        </div>

        {/* ↑ 左邊問候不動，下面是改大的四顆按鈕 */}
        <div
          style={{
            display: "flex",
            gap: 12, // 按鈕之間距離大一點
          }}
        >
          <button
            className="btn-outline"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 999,
            }}
            onClick={() => navigate("/stats")}
          >
            統計圖表
          </button>

          <button
            className="btn-outline"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 999,
            }}
            onClick={() => navigate("/reflection")}
          >
            每日反思
          </button>

          <button
            className="btn-outline"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 999,
            }}
            onClick={() => navigate("/coach")}
          >
            AI 教練
          </button>

          <button
            className="btn-outline"
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 999,
            }}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            登出
          </button>
        </div>
      </div>

      {/* 左：AI 時間軸 右：Session + Plan */}
      <div className="dashboard-grid">
        {/* 左側：AI 排程時間軸 */}
        <section className="glass-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                今日 AI 排程
              </div>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {todayStr} 的時間表
              </h2>
            </div>
            <button
              className="btn-primary"
              onClick={handleAutoScheduleToday}
              disabled={autoScheduling}
            >
              {autoScheduling ? "排程計算中..." : "🧠 AI 排程今天"}
            </button>
          </div>

          {autoSchedule ? (
            <>
              <div className="timeline">
                {autoSchedule.schedule.map((b, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-time">
                      {b.start} ~ {b.end}
                    </div>
                    <div className="timeline-title">{b.title}</div>
                    {b.note && (
                      <div className="timeline-note">（{b.note}）</div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleMarkDistractedOnBlock(b)}
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "rgba(15,23,42,0.9)",
                        color: "var(--text-main)",
                        cursor: "pointer",
                      }}
                    >
                      😵 這段有分心，要記錄原因
                    </button>
                  </div>
                ))}
              </div>
              {autoSchedule.summary && (
                <p
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  小結：{autoSchedule.summary}
                </p>
              )}
            </>
          ) : (
            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              點右上角「AI 排程今天」，讓 AI 幫你排出今天的讀書時間表。
            </p>
          )}
        </section>

        {/* 右側：上 專注摘要 + 下 今日計畫 */}
        <div className="sidebar-stack">
          {/* 今日專注摘要 */}
          <section className="glass-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div>
                <div className="focus-summary-label">今日專注總時數</div>
                <div className="focus-summary">{totalFocusMinutes} 分鐘</div>
              </div>
              <button className="btn-outline" onClick={scrollToSessionForm}>
                ➜ 新增專注紀錄
              </button>
            </div>
            {sessions.length > 0 && (
              <ul
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  paddingLeft: 18,
                  color: "var(--text-muted)",
                }}
              >
                {sessions.slice(0, 3).map((s) => (
                  <li key={s._id}>
                    {new Date(s.startTime).toTimeString().slice(0, 5)}~
                    {new Date(s.endTime).toTimeString().slice(0, 5)} ·{" "}
                    {s.durationMinutes} 分
                    {s.interrupted && "（有分心）"}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 今日學習計畫 */}
          <section className="glass-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>
                今天的學習計畫（{todayStr}）
              </h2>
            </div>

            {/* 表單 */}
            <form
              onSubmit={handleCreatePlan}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div>
                <label className="label-light">任務名稱</label>
                <input
                  name="title"
                  className="input-dark"
                  value={planForm.title}
                  onChange={handlePlanChange}
                  required
                />
              </div>
              <div>
                <label className="label-light">科目</label>
                <input
                  name="subject"
                  className="input-dark"
                  value={planForm.subject}
                  onChange={handlePlanChange}
                />
              </div>
              <div>
                <label className="label-light">預估時間（分鐘）</label>
                <input
                  name="estimatedMinutes"
                  type="number"
                  min="10"
                  className="input-dark"
                  value={planForm.estimatedMinutes}
                  onChange={handlePlanChange}
                />
              </div>
              <div>
                <label className="label-light">優先級</label>
                <select
                  name="priority"
                  className="select-dark"
                  value={planForm.priority}
                  onChange={handlePlanChange}
                >
                  <option value="must">必做</option>
                  <option value="should">建議</option>
                  <option value="nice">有空再做</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={startListening}
                >
                  🎤 語音輸入
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleParseVoiceToPlans}
                  disabled={parsingPlans}
                >
                  {parsingPlans ? "AI 解析中..." : "✨ AI 解析為多個任務"}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creatingPlan}
                  style={{ marginLeft: "auto" }}
                >
                  {creatingPlan ? "新增中..." : "建立計畫"}
                </button>
              </div>
            </form>

            {voiceText && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: -4,
                }}
              >
                語音文字：{voiceText}
              </p>
            )}

            {/* AI 解析出來的任務預覽區 */}
            {parsedPlans.length > 0 && (
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.5)",
                  padding: 10,
                  borderRadius: 10,
                  marginTop: 10,
                  marginBottom: 10,
                  background: "rgba(15,23,42,0.9)",
                  fontSize: 13,
                }}
              >
                <h3 style={{ marginTop: 0, fontSize: 14 }}>AI 解析出的任務：</h3>
                <ul>
                  {parsedPlans.map((p, idx) => (
                    <li key={idx}>
                      [{p.priority}] {p.title}（科目：{p.subject || "未填"}，
                      預估 {p.estimatedMinutes} 分鐘，日期：{p.date}）
                    </li>
                  ))}
                </ul>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={handleConfirmParsedPlans}
                >
                  ✅ 確認並建立所有任務
                </button>{" "}
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => setParsedPlans([])}
                >
                  取消
                </button>
              </div>
            )}

            {/* 今日計畫列表（卡片） */}
            {plansError && (
              <p style={{ color: "salmon", fontSize: 13 }}>{plansError}</p>
            )}
            {plansLoading ? (
              <p>載入中...</p>
            ) : plans.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                今天還沒有計畫。
              </p>
            ) : (
              <div className="plans-grid">
                {plans.map((p) => {
                  const priorityClass =
                    p.priority === "must"
                      ? "plan-pill plan-pill-priority-must"
                      : p.priority === "should"
                      ? "plan-pill plan-pill-priority-should"
                      : "plan-pill plan-pill-priority-nice";

                  return (
                    <div key={p._id} className="plan-card">
                      <div className="plan-title">{p.title}</div>
                      <div className="plan-sub">
                        {p.subject || "未填科目"} · 預估 {p.estimatedMinutes} 分鐘
                      </div>
                      <div className="plan-meta">
                        <span className={priorityClass}>
                          {p.priority === "must"
                            ? "必做"
                            : p.priority === "should"
                            ? "建議"
                            : "有空再做"}
                        </span>
                        <span className="plan-pill plan-pill-status">{p.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ===== 今日專注紀錄（詳細） ===== */}
      <section ref={sessionSectionRef}className="glass-card"style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>今日專注紀錄</h2>

        <form onSubmit={handleCreateSession} style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label-light">開始時間</label>
              <input
                ref={sessionStartInputRef}
                type="datetime-local"
                name="startTime"
                value={sessionForm.startTime}
                onChange={handleSessionChange}
                className="input-dark"
              />
            </div>
            <div>
              <label className="label-light">結束時間</label>
              <input
                type="datetime-local"
                name="endTime"
                value={sessionForm.endTime}
                onChange={handleSessionChange}
                className="input-dark"
              />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                name="interrupted"
                checked={sessionForm.interrupted}
                onChange={handleSessionChange}
                style={{ marginRight: 6 }}
              />
              中途有分心
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label className="label-light">分心原因（用「，」分隔）</label>
            <input
              name="interruptReasons"
              className="input-dark"
              value={sessionForm.interruptReasons}
              onChange={handleSessionChange}
              placeholder="手機，滑 IG，聊天"
            />
          </div>
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <label className="label-light">備註</label>
            <input
              name="note"
              className="input-dark"
              value={sessionForm.note}
              onChange={handleSessionChange}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={creatingSession}>
            {creatingSession ? "新增中..." : "新增專注紀錄"}
          </button>
        </form>

        {sessionsError && <p style={{ color: "salmon" }}>{sessionsError}</p>}
        {sessionsLoading ? (
          <p>載入中...</p>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            今天還沒有專注紀錄。
          </p>
        ) : (
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>
            {sessions.map((s) => (
              <li key={s._id}>
                {new Date(s.startTime).toLocaleTimeString()} ~{" "}
                {new Date(s.endTime).toLocaleTimeString()} ，
                {s.durationMinutes} 分鐘
                {s.interrupted && "（有分心）"}
                {s.interruptReasons && s.interruptReasons.length > 0 && (
                  <>，原因：{s.interruptReasons.join("、")}</>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
