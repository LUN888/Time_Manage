// src/pages/CalendarPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

function formatDateToYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 取得某月的所有日期（包含前後月填充）
function getCalendarDates(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const dates = [];
  
  // 填充上個月的日期（讓第一週從週日開始）
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    dates.push({ date: d, isCurrentMonth: false });
  }
  
  // 當月日期
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    dates.push({ date: d, isCurrentMonth: true });
  }
  
  // 填充下個月的日期（讓總共是 6 週）
  const remaining = 42 - dates.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    dates.push({ date: d, isCurrentMonth: false });
  }
  
  return dates;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function CalendarPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 視圖模式：list 或 calendar
  const [viewMode, setViewMode] = useState("calendar");
  
  // 月曆當前月份
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // 連結狀態
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // 日曆清單（使用 Set 支援多選）
  const [calendars, setCalendars] = useState([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState(new Set(["primary"]));

  // 事件列表
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(new Set());

  // 日期範圍（列表模式用）
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [dateFrom, setDateFrom] = useState(formatDateToYMD(today));
  const [dateTo, setDateTo] = useState(formatDateToYMD(nextWeek));

  // 匯入狀態
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // 取得某日期的事件
  const getEventsForDate = (date) => {
    const dateStr = formatDateToYMD(date);
    return events.filter((event) => {
      const eventStart = event.start.slice(0, 10);
      
      // 全天事件才跨日顯示，一般事件只顯示在開始日期
      if (event.isAllDay && event.end) {
        // 全天事件的結束日期通常是「下一天」，所以要減一天
        const endDate = new Date(event.end);
        endDate.setDate(endDate.getDate() - 1);
        const eventEnd = formatDateToYMD(endDate);
        return dateStr >= eventStart && dateStr <= eventEnd;
      }
      
      // 非全天事件只顯示在開始日期
      return dateStr === eventStart;
    });
  };

  // 月曆導航
  const goToPrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  // 當月份變更時，自動抓取該月事件
  useEffect(() => {
    if (isConnected && viewMode === "calendar") {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = formatDateToYMD(new Date(year, month, 1));
      const lastDay = formatDateToYMD(new Date(year, month + 1, 0));
      fetchEventsForRange(firstDay, lastDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, isConnected, viewMode, selectedCalendarIds]);

  // 檢查連結狀態
  const checkStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/calendar/google/status");
      setIsConnected(res.data.connected);
      if (res.data.connected) {
        fetchCalendars();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 取得日曆清單
  const fetchCalendars = async () => {
    try {
      const res = await api.get("/api/calendar/google/calendars");
      setCalendars(res.data.calendars || []);
    } catch (err) {
      console.error("Fetch calendars error:", err);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    checkStatus();

    // 檢查 URL 參數
    if (searchParams.get("connected") === "true") {
      setIsConnected(true);
      fetchCalendars();
      fetchEvents();
    }
    if (searchParams.get("error")) {
      alert("Google 授權失敗，請重試");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  // 切換日曆選取狀態
  const toggleCalendarSelection = (calendarId) => {
    setSelectedCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  };

  // 連結 Google 帳號
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await api.get("/api/calendar/google/auth-url");
      // 導向 Google 授權頁面
      window.location.href = res.data.url;
    } catch (err) {
      console.error(err);
      alert("取得授權連結失敗");
      setConnecting(false);
    }
  };

  // 取消連結
  const handleDisconnect = async () => {
    if (!window.confirm("確定要取消連結 Google Calendar？")) return;
    try {
      await api.delete("/api/calendar/google/disconnect");
      setIsConnected(false);
      setEvents([]);
      setCalendars([]);
      setSelectedEvents(new Set());
      setSelectedCalendarIds(new Set(["primary"]));
    } catch (err) {
      console.error(err);
      alert("取消連結失敗");
    }
  };

  // 取得行事曆事件（支援多日曆）
  const fetchEvents = async () => {
    if (selectedCalendarIds.size === 0) {
      setEvents([]);
      return;
    }

    setEventsLoading(true);
    setImportResult(null);
    try {
      // 同時請求所有選取的日曆
      const promises = Array.from(selectedCalendarIds).map((calId) =>
        api.get(
          `/api/calendar/google/events?from=${dateFrom}&to=${dateTo}&calendarId=${encodeURIComponent(calId)}`
        )
      );
      const results = await Promise.all(promises);

      // 合併所有事件並按時間排序
      const allEvents = results.flatMap((res) => res.data.events || []);
      allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

      setEvents(allEvents);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) {
        setIsConnected(false);
        alert("授權已過期，請重新連結");
      } else {
        alert("取得事件失敗");
      }
    } finally {
      setEventsLoading(false);
    }
  };

  // 取得指定日期範圍的事件（月曆模式用）
  const fetchEventsForRange = async (from, to) => {
    if (selectedCalendarIds.size === 0) {
      setEvents([]);
      return;
    }

    setEventsLoading(true);
    try {
      const promises = Array.from(selectedCalendarIds).map((calId) =>
        api.get(
          `/api/calendar/google/events?from=${from}&to=${to}&calendarId=${encodeURIComponent(calId)}`
        )
      );
      const results = await Promise.all(promises);
      const allEvents = results.flatMap((res) => res.data.events || []);
      allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
      setEvents(allEvents);
    } catch (err) {
      console.error(err);
    } finally {
      setEventsLoading(false);
    }
  };

  // 切換選取事件
  const toggleEventSelection = (eventId) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  // 全選/取消全選
  const toggleSelectAll = () => {
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(events.map((e) => e.id)));
    }
  };

  // 匯入選取的事件
  const handleImport = async () => {
    if (selectedEvents.size === 0) {
      alert("請先選擇要匯入的事件");
      return;
    }

    setImporting(true);
    try {
      const eventsToImport = events
        .filter((e) => selectedEvents.has(e.id))
        .map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
          priority: "should", // 預設為 should
        }));

      const res = await api.post("/api/calendar/import", {
        events: eventsToImport,
      });

      setImportResult({
        success: true,
        message: res.data.message,
      });
      setSelectedEvents(new Set());
    } catch (err) {
      console.error(err);
      setImportResult({
        success: false,
        message: err.response?.data?.error || "匯入失敗",
      });
    } finally {
      setImporting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="dashboard-shell">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>📅 行事曆整合</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            從 Google Calendar 匯入事件到學習計畫
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn-outline" onClick={() => navigate("/dashboard")}>
            返回首頁
          </button>
          <button
            className="btn-outline"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            登出
          </button>
        </div>
      </div>

      {/* 連結狀態區 */}
      <section className="glass-card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>
          Google Calendar 連結狀態
        </h2>

        {loading ? (
          <p>檢查連結狀態中...</p>
        ) : isConnected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#22c55e",
                }}
              />
              <span style={{ color: "#22c55e", fontWeight: 500 }}>
                已連結 Google Calendar
              </span>
            </div>
            <button
              className="btn-outline"
              onClick={handleDisconnect}
              style={{ color: "salmon", borderColor: "rgba(255,100,100,0.4)" }}
            >
              取消連結
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              尚未連結 Google Calendar。連結後可以匯入行事曆事件作為學習計畫。
            </p>
            <button
              className="btn-primary"
              onClick={handleConnect}
              disabled={connecting}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                  fill="#FFC107"
                />
                <path
                  d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                  fill="#FF3D00"
                />
                <path
                  d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                  fill="#4CAF50"
                />
                <path
                  d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                  fill="#1976D2"
                />
              </svg>
              {connecting ? "連結中..." : "連結 Google 帳號"}
            </button>
          </div>
        )}
      </section>

      {/* 事件列表區（僅當已連結時顯示） */}
      {isConnected && (
        <section className="glass-card">
          {/* 標題與視圖切換 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>行事曆事件</h2>
            
            {/* 視圖切換按鈕 */}
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className={viewMode === "calendar" ? "btn-primary" : "btn-outline"}
                onClick={() => setViewMode("calendar")}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                📅 月曆
              </button>
              <button
                className={viewMode === "list" ? "btn-primary" : "btn-outline"}
                onClick={() => setViewMode("list")}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                📋 列表
              </button>
            </div>
          </div>

          {/* ===== 月曆視圖 ===== */}
          {viewMode === "calendar" && (
            <>
              {/* 日曆選擇器（勾選方式） */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {/* 主要日曆 */}
                  <div
                    onClick={() => toggleCalendarSelection("primary")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: selectedCalendarIds.has("primary")
                        ? "rgba(66, 133, 244, 0.2)"
                        : "rgba(30, 41, 59, 0.6)",
                      border: selectedCalendarIds.has("primary")
                        ? "2px solid #4285f4"
                        : "1px solid rgba(148, 163, 184, 0.2)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: selectedCalendarIds.has("primary")
                          ? "#4285f4"
                          : "transparent",
                        border: "2px solid #4285f4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selectedCalendarIds.has("primary") && (
                        <span style={{ color: "#fff", fontSize: 9 }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12 }}>主要日曆</span>
                  </div>

                  {/* 其他日曆 */}
                  {calendars
                    .filter((c) => !c.primary)
                    .map((cal) => (
                      <div
                        key={cal.id}
                        onClick={() => toggleCalendarSelection(cal.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 10px",
                          borderRadius: 6,
                          background: selectedCalendarIds.has(cal.id)
                            ? `${cal.backgroundColor || "#7986cb"}22`
                            : "rgba(30, 41, 59, 0.6)",
                          border: selectedCalendarIds.has(cal.id)
                            ? `2px solid ${cal.backgroundColor || "#7986cb"}`
                            : "1px solid rgba(148, 163, 184, 0.2)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: selectedCalendarIds.has(cal.id)
                              ? cal.backgroundColor || "#7986cb"
                              : "transparent",
                            border: `2px solid ${cal.backgroundColor || "#7986cb"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {selectedCalendarIds.has(cal.id) && (
                            <span style={{ color: "#fff", fontSize: 9 }}>✓</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12 }}>{cal.name}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* 月份導航 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="btn-outline" onClick={goToPrevMonth} style={{ padding: "6px 12px" }}>
                    ◀
                  </button>
                  <button className="btn-outline" onClick={goToNextMonth} style={{ padding: "6px 12px" }}>
                    ▶
                  </button>
                  <button className="btn-outline" onClick={goToToday} style={{ padding: "6px 12px", fontSize: 12 }}>
                    今天
                  </button>
                </div>
                <h3 style={{ margin: 0, fontSize: 18 }}>
                  {currentMonth.getFullYear()} 年 {currentMonth.getMonth() + 1} 月
                </h3>
                <div style={{ width: 120 }} /> {/* Spacer */}
              </div>

              {/* 載入中提示 */}
              {eventsLoading && (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>
                  載入事件中...
                </div>
              )}

              {/* 月曆網格 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 1,
                  background: "rgba(148, 163, 184, 0.2)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* 星期標題 */}
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    style={{
                      padding: "8px 4px",
                      textAlign: "center",
                      background: "rgba(30, 41, 59, 0.8)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: day === "日" ? "#ef4444" : day === "六" ? "#3b82f6" : "var(--text-main)",
                    }}
                  >
                    {day}
                  </div>
                ))}

                {/* 日期格子 */}
                {getCalendarDates(currentMonth.getFullYear(), currentMonth.getMonth()).map(
                  ({ date, isCurrentMonth }, idx) => {
                    const dateEvents = getEventsForDate(date);
                    const isToday = formatDateToYMD(date) === formatDateToYMD(new Date());
                    const dayOfWeek = date.getDay();

                    return (
                      <div
                        key={idx}
                        style={{
                          minHeight: 80,
                          padding: 4,
                          background: isCurrentMonth
                            ? "rgba(30, 41, 59, 0.6)"
                            : "rgba(30, 41, 59, 0.3)",
                          display: "flex",
                          flexDirection: "column",
                          overflow: "hidden",
                          minWidth: 0,
                        }}
                      >
                        {/* 日期數字 */}
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: isToday ? 700 : 400,
                            color: !isCurrentMonth
                              ? "rgba(148, 163, 184, 0.4)"
                              : dayOfWeek === 0
                              ? "#ef4444"
                              : dayOfWeek === 6
                              ? "#3b82f6"
                              : "var(--text-main)",
                            marginBottom: 4,
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: isToday ? "var(--accent)" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {date.getDate()}
                        </div>

                        {/* 事件列表 */}
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          {dateEvents.slice(0, 3).map((event, i) => (
                            <div
                              key={event.id + i}
                              onClick={() => toggleEventSelection(event.id)}
                              style={{
                                fontSize: 10,
                                padding: "2px 4px",
                                marginBottom: 2,
                                borderRadius: 3,
                                background: selectedEvents.has(event.id)
                                  ? "var(--accent)"
                                  : event.calendarId === "primary"
                                  ? "#4285f4"
                                  : "#7986cb",
                                color: "#fff",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                cursor: "pointer",
                                display: "block",
                                maxWidth: "100%",
                              }}
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dateEvents.length > 3 && (
                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              +{dateEvents.length - 3} 更多
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {/* 選取的事件匯入區 */}
              {selectedEvents.size > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    background: "rgba(99, 102, 241, 0.1)",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>已選取 {selectedEvents.size} 個事件</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-outline"
                      onClick={() => setSelectedEvents(new Set())}
                      style={{ fontSize: 12 }}
                    >
                      取消選取
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleImport}
                      disabled={importing}
                    >
                      {importing ? "匯入中..." : "匯入到學習計畫"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== 列表視圖 ===== */}
          {viewMode === "list" && (
            <>
              {/* 日曆選擇器（勾選方式） */}
              <div style={{ marginBottom: 16 }}>
                <label className="label-light" style={{ marginBottom: 8, display: "block" }}>
                  選擇日曆（可多選）
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
              {/* 主要日曆 */}
              <div
                onClick={() => toggleCalendarSelection("primary")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: selectedCalendarIds.has("primary")
                    ? "rgba(99, 102, 241, 0.2)"
                    : "rgba(30, 41, 59, 0.6)",
                  border: selectedCalendarIds.has("primary")
                    ? "2px solid var(--accent)"
                    : "1px solid rgba(148, 163, 184, 0.2)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: selectedCalendarIds.has("primary")
                      ? "#4285f4"
                      : "transparent",
                    border: "2px solid #4285f4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selectedCalendarIds.has("primary") && (
                    <span style={{ color: "#fff", fontSize: 10 }}>✓</span>
                  )}
                </div>
                <span style={{ fontSize: 13 }}>主要日曆</span>
              </div>

              {/* 其他日曆 */}
              {calendars
                .filter((c) => !c.primary)
                .map((cal) => (
                  <div
                    key={cal.id}
                    onClick={() => toggleCalendarSelection(cal.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: selectedCalendarIds.has(cal.id)
                        ? "rgba(99, 102, 241, 0.2)"
                        : "rgba(30, 41, 59, 0.6)",
                      border: selectedCalendarIds.has(cal.id)
                        ? "2px solid var(--accent)"
                        : "1px solid rgba(148, 163, 184, 0.2)",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: selectedCalendarIds.has(cal.id)
                          ? cal.backgroundColor || "#7986cb"
                          : "transparent",
                        border: `2px solid ${cal.backgroundColor || "#7986cb"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selectedCalendarIds.has(cal.id) && (
                        <span style={{ color: "#fff", fontSize: 10 }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: 13 }}>{cal.name}</span>
                  </div>
                ))}
                </div>
              </div>

              {/* 日期範圍選擇 */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <label className="label-light">從</label>
                  <input
                    type="date"
                    className="input-dark"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label-light">到</label>
                  <input
                    type="date"
                    className="input-dark"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={() => fetchEvents()}
                  disabled={eventsLoading || selectedCalendarIds.size === 0}
                  style={{ alignSelf: "flex-end" }}
                >
                  {eventsLoading ? "載入中..." : `取得事件 (${selectedCalendarIds.size} 個日曆)`}
                </button>
              </div>

              {/* 匯入結果提示 */}
              {importResult && (
                <div
                  style={{
                    padding: "12px 16px",
                    marginBottom: 16,
                    borderRadius: 8,
                    background: importResult.success
                      ? "rgba(34, 197, 94, 0.15)"
                      : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${
                      importResult.success
                        ? "rgba(34, 197, 94, 0.4)"
                        : "rgba(239, 68, 68, 0.4)"
                    }`,
                    color: importResult.success ? "#22c55e" : "#ef4444",
                  }}
                >
                  {importResult.message}
                </div>
              )}

              {/* 事件列表 */}
              {events.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {eventsLoading
                    ? "載入中..."
                    : "這個日期範圍內沒有事件，或尚未取得事件。"}
                </p>
              ) : (
                <>
              {/* 操作列 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <button
                  className="btn-outline"
                  onClick={toggleSelectAll}
                  style={{ fontSize: 12 }}
                >
                  {selectedEvents.size === events.length
                    ? "取消全選"
                    : "全選"}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={importing || selectedEvents.size === 0}
                >
                  {importing
                    ? "匯入中..."
                    : `匯入選取項目 (${selectedEvents.size})`}
                </button>
              </div>

              {/* 事件卡片 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {events.map((event) => {
                  const isSelected = selectedEvents.has(event.id);
                  const startDate = new Date(event.start);
                  const endDate = event.end ? new Date(event.end) : null;

                  return (
                    <div
                      key={event.id}
                      onClick={() => toggleEventSelection(event.id)}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 10,
                        background: isSelected
                          ? "rgba(99, 102, 241, 0.15)"
                          : "rgba(30, 41, 59, 0.6)",
                        border: isSelected
                          ? "2px solid var(--accent)"
                          : "1px solid rgba(148, 163, 184, 0.2)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            {event.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                            }}
                          >
                            {event.isAllDay
                              ? `${startDate.toLocaleDateString()} (整天)`
                              : `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" }
                                )}${
                                  endDate
                                    ? ` ~ ${endDate.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}`
                                    : ""
                                }`}
                          </div>
                          {event.location && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 4,
                              }}
                            >
                              📍 {event.location}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            border: isSelected
                              ? "2px solid var(--accent)"
                              : "2px solid rgba(148, 163, 184, 0.4)",
                            background: isSelected
                              ? "var(--accent)"
                              : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isSelected && (
                            <span style={{ color: "#fff", fontSize: 14 }}>
                              ✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
