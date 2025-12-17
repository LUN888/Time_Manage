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

function formatTimeOnly(dateStr) {
    if (!dateStr) return null;
    if (dateStr.length <= 10) return "彈性規劃"; // 只有 YYYY-MM-DD，沒有時間
    
    // 檢查是否為 T00:00:00 格式（表示沒有指定時間）
    if (dateStr.includes("T00:00:00") || dateStr.includes("T00:00")) {
      return "彈性規劃";
    }
    
    const date = new Date(dateStr);
    const h = date.getHours();
    const m = date.getMinutes();
    
    // 額外檢查：08:00 可能是 UTC 00:00 轉換來的（時區問題）
    // 如果原始字串包含 T00:00，但被轉成 08:00，仍視為彈性規劃
    if (h === 8 && m === 0 && dateStr.includes("T00:")) {
      return "彈性規劃";
    }
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sessionSectionRef = useRef(null);

  const today = new Date();
  const todayStr = formatDateToYMD(today);
  const tomorrowStr = formatDateToYMD(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  );

  // ---- 計畫相關 ----
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState("");
  const [plansLoading, setPlansLoading] = useState(true);

  // ---- 自然語言新增計畫（新的） ----
  const [nlInput, setNlInput] = useState(""); // 使用者自然語言輸入
  const [nlParsing, setNlParsing] = useState(false); // 解析中
  const [nlPreview, setNlPreview] = useState(null); // AI 單筆預覽
  const [nlCreating, setNlCreating] = useState(false); // 建立中

  // 語音解析
  const [voiceText, setVoiceText] = useState("");

  // AI 自動排程的結果
  const [autoSchedule, setAutoSchedule] = useState(null); // { date, schedule, summary }
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [settling, setSettling] = useState(false); // 結算中

  // ---- 專注紀錄相關 ----
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // 分心回報 modal
  const [distractionModal, setDistractionModal] = useState({
    open: false,
    block: null, // { start, end, title, planId }
    reasons: "",
    submitting: false,
  });

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

  // 載入已儲存的排程
  const fetchSchedule = async () => {
    try {
      const res = await api.get(`/api/schedule?date=${todayStr}`);
      if (res.data.exists) {
        setAutoSchedule({
          date: res.data.date,
          schedule: res.data.schedule,
          summary: res.data.summary,
        });
      }
    } catch (err) {
      console.error("Fetch schedule error:", err);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchPlans();
    fetchSessions();
    fetchSchedule(); // 載入已儲存的排程
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

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

      setVoiceText(text); // 顯示給使用者看
      setNlInput(text); // 把語音塞到自然語言輸入框
    };

    recognition.onerror = (e) => {
      console.error("語音辨識錯誤：", e.error);
    };

    recognition.start();
  };

  //---- 自然語言新增計畫功能的處理函式 ----
  // 🧠（新增）解析自然語言成 1 筆預覽資料
  async function handleNLParse() {
    if (!nlInput.trim()) return;

    setNlParsing(true);
    try {
      const res = await api.post("/api/plans/parse", {
        text: nlInput,
        date: todayStr,
      });

      const plans = res.data.plans || [];
      if (plans.length === 0) {
        alert("AI 無法解析這段內容，請換種說法試試看");
        return;
      }

      // ⭐ 你目前要「單筆預覽」，所以只拿第一筆
      setNlPreview(plans[0]);
    } catch (err) {
      console.error(err);
      alert("AI 解析失敗");
    } finally {
      setNlParsing(false);
    }
  }

  // ✔（新增）按下「確認建立」→ 寫入資料庫 → 更新前端
  async function handleNLConfirm() {
    if (!nlPreview) return;

    setNlCreating(true);
    try {
      const res = await api.post("/api/plans", {
        ...nlPreview,
      });

      // 加入左邊卡片列表
      setPlans((prev) => [...prev, res.data]);

      // 清空預覽與輸入
      setNlPreview(null);
      setNlInput("");
    } catch (err) {
      console.error(err);
      alert("建立任務失敗，請稍後再試");
    } finally {
      setNlCreating(false);
    }
  }

  // ---- 刪除計畫卡片 ----
  async function handleDeletePlan(id) {
    if (!window.confirm("確定要刪除這個計畫嗎？")) return;

    try {
      await api.delete(`/api/plans/${id}`);

      // 前端即時更新
      setPlans((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      console.error(err);
      alert("刪除失敗");
    }
  }

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

  // 結算今日專注紀錄
  const handleSettleSessions = async () => {
    if (!autoSchedule) {
      alert("請先產生今日排程");
      return;
    }
    
    setSettling(true);
    try {
      const res = await api.post("/api/sessions/settle", {
        date: todayStr,
      });
      
      alert(res.data.message);
      await fetchSessions(); // 重新載入專注紀錄
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "結算失敗");
    } finally {
      setSettling(false);
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

  // ✅ 開啟分心回報 modal
  const openDistractionModal = (block) => {
    if (!autoSchedule) return;
    setDistractionModal({
      open: true,
      block: block,
      reasons: "",
      submitting: false,
    });
  };

  // 提交分心紀錄
  const submitDistraction = async () => {
    if (!distractionModal.block || !autoSchedule) return;
    
    const block = distractionModal.block;
    const reasons = distractionModal.reasons
      .split(/[，,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    
    if (reasons.length === 0) {
      alert("請輸入分心原因");
      return;
    }

    setDistractionModal((prev) => ({ ...prev, submitting: true }));
    
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
      setDistractionModal({ open: false, block: null, reasons: "", submitting: false });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "紀錄分心時發生錯誤");
      setDistractionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // 關閉 modal
  const closeDistractionModal = () => {
    setDistractionModal({ open: false, block: null, reasons: "", submitting: false });
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
            onClick={() => navigate("/calendar")}
          >
            📅 行事曆
          </button>

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
              <h2 style={{ margin: 0, fontSize: 18 }}>{todayStr} 的時間表</h2>
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
                      onClick={() => openDistractionModal(b)}
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
              
              {/* 結算按鈕 */}
              <button
                className="btn-primary"
                onClick={handleSettleSessions}
                disabled={settling}
                style={{
                  marginTop: 16,
                  width: "100%",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                }}
              >
                {settling ? "結算中..." : "✅ 結算今日專注紀錄"}
              </button>
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
                    {s.durationMinutes} 分{s.interrupted && "（有分心）"}
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

            {/* === 新：語音 + 自然語言輸入 + 送出解析 === */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {/* 語音輸入 */}
              <button
                type="button"
                className="btn-outline"
                onClick={startListening}
              >
                🎤 語音
              </button>

              {/* 自然語言輸入框 */}
              <input
                type="text"
                className="input-dark"
                style={{ flex: 1 }}
                placeholder="例如：晚上讀數學二次函數 1 小時，必做"
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
              />

              {/* AI 解析按鈕 */}
              <button
                type="button"
                className="btn-primary"
                onClick={handleNLParse}
                disabled={nlParsing || !nlInput.trim()}
              >
                {nlParsing ? "解析中..." : "送出"}
              </button>
            </div>

            {/* === 新：AI 單筆預覽卡片（解析成功後才會出現） === */}
            {nlPreview && (
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.5)",
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.9)",
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <h3 style={{ marginTop: 0, fontSize: 14 }}>AI 解析的計畫</h3>

                <p>任務：{nlPreview.title}</p>
                <p>科目：{nlPreview.subject || "（未填）"}</p>
                <p>預估時間：{nlPreview.estimatedMinutes} 分鐘</p>
                <p>優先級：{nlPreview.priority}</p>
                <p>日期：{nlPreview.date.slice(0, 10)} {formatTimeOnly(nlPreview.date)}</p>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="btn-primary"
                    onClick={handleNLConfirm}
                    disabled={nlCreating}
                  >
                    {nlCreating ? "建立中..." : "確認建立"}
                  </button>

                  <button
                    className="btn-outline"
                    onClick={() => setNlPreview(null)}
                    disabled={nlCreating}
                  >
                    取消
                  </button>
                </div>
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
                    <div
                      key={p._id}
                      className="plan-card"
                      style={{ position: "relative" }}
                    >
                      {/* 刪除按鈕（右上角） */}
                      <button
                        onClick={() => handleDeletePlan(p._id)}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          background: "rgba(255,80,80,0.15)",
                          border: "1px solid rgba(255,80,80,0.4)",
                          color: "salmon",
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                        }}
                      >
                        刪除
                      </button>

                      {/* 原本內容 */}
                      <div className="plan-title">
                        {p.title}
                        {(() => {
                            const t = formatTimeOnly(p.date);
                            return t && t !== '00:00' ? <span style={{fontSize: '0.8em', marginLeft: 8, color: 'var(--accent)'}}>@{t}</span> : null;
                        })()}
                      </div>
                      <div className="plan-sub">
                        {p.subject || "未填科目"} · {p.endDate ? "每日建議" : "預估"} {p.estimatedMinutes}{" "}
                        分鐘
                      </div>
                      <div className="plan-meta">
                        <span className={priorityClass}>
                          {p.priority === "must"
                            ? "必做"
                            : p.priority === "should"
                            ? "建議"
                            : "有空再做"}
                        </span>
                        <span className="plan-pill plan-pill-status">
                          {p.status === "pending" ? "待辦事項" : p.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ===== 今日專注紀錄（只顯示，不提供手動新增） ===== */}
      <section
        ref={sessionSectionRef}
        className="glass-card"
        style={{ marginTop: 20 }}
      >
        <h2 style={{ marginTop: 0 }}>今日專注紀錄</h2>

        {sessionsError && <p style={{ color: "salmon" }}>{sessionsError}</p>}
        {sessionsLoading ? (
          <p>載入中...</p>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            今天還沒有專注紀錄。使用上方時間表的分心回報或結算功能來記錄。
          </p>
        ) : (
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>
            {sessions.map((s) => (
              <li key={s._id} style={{ marginBottom: 6 }}>
                <span style={{ color: s.interrupted ? "salmon" : "#10b981" }}>
                  {s.interrupted ? "😵" : "✅"}
                </span>{" "}
                {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ~{" "}
                {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                  {s.durationMinutes} 分鐘
                </span>
                {s.note && (
                  <span style={{ marginLeft: 8 }}>
                    {s.note}
                  </span>
                )}
                {s.interrupted && s.interruptReasons && s.interruptReasons.length > 0 && (
                  <span style={{ color: "salmon", marginLeft: 8 }}>
                    （{s.interruptReasons.join("、")}）
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 分心回報 Modal */}
      {distractionModal.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeDistractionModal}
        >
          <div
            style={{
              background: "linear-gradient(145deg, #1e293b, #0f172a)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 400,
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>
              😵 回報分心 - {distractionModal.block?.title}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px 0" }}>
              {distractionModal.block?.start} ~ {distractionModal.block?.end}
            </p>
            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
              分心原因（用逗號分隔）
            </label>
            <input
              type="text"
              className="input-dark"
              placeholder="手機、滑 IG、聊天"
              value={distractionModal.reasons}
              onChange={(e) => setDistractionModal((prev) => ({ ...prev, reasons: e.target.value }))}
              style={{ width: "100%", marginBottom: 16 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn-outline"
                onClick={closeDistractionModal}
                disabled={distractionModal.submitting}
              >
                取消
              </button>
              <button
                className="btn-primary"
                onClick={submitDistraction}
                disabled={distractionModal.submitting}
                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
              >
                {distractionModal.submitting ? "記錄中..." : "確認記錄"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
