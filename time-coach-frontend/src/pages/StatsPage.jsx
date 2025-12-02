// src/pages/StatsPage.jsx
import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function getLast7Days() {
  const days = [];
  const today = new Date();
  // 從 6 天前到今天（共 7 天）
  for (let i = 6; i >= 0; i--) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i
    );
    days.push(d);
  }
  return days;
}

function formatYMD(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function StatsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [data7Days, setData7Days] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const days = getLast7Days();
        const from = formatYMD(days[0]);
        // to 是「最後一天的隔天」，因為後端是 < to
        const last = days[days.length - 1];
        const toDate = new Date(
          last.getFullYear(),
          last.getMonth(),
          last.getDate() + 1
        );
        const to = formatYMD(toDate);

        // 1. 取得這 7 天的 sessions
        const sessionsRes = await api.get(
          `/api/sessions?from=${from}&to=${to}`
        );
        const sessions = sessionsRes.data;

        // 2. 取得這 7 天的 reflections
        const reflectionsRes = await api.get(
          `/api/reflections?from=${from}&to=${to}`
        );
        const reflections = reflectionsRes.data;

        // 3. 計算每一天的專注分鐘數
        const focusByDay = {};
        sessions.forEach((s) => {
          const dayKey = s.startTime.slice(0, 10); // YYYY-MM-DD
          const mins =
            typeof s.durationMinutes === "number"
              ? s.durationMinutes
              : 0;
          focusByDay[dayKey] = (focusByDay[dayKey] || 0) + mins;
        });

        // 4. 每日完成度（如果同一天有多筆反思，就取最後一筆）
        const completionByDay = {};
        reflections.forEach((r) => {
          const dayKey = r.date.slice(0, 10);
          completionByDay[dayKey] = r.completionScore ?? null;
        });

        // 5. 組成圖表資料
        const chartData = days.map((d) => {
          const key = formatYMD(d);
          return {
            date: key,
            label: `${d.getMonth() + 1}/${d.getDate()}`, // x 軸顯示
            focusMinutes: focusByDay[key] || 0,
            completionScore:
              completionByDay[key] !== undefined
                ? completionByDay[key]
                : null,
          };
        });

        setData7Days(chartData);
      } catch (err) {
        console.error(err);
        setError("取得統計資料失敗");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>本週學習統計（近 7 天）</h1>
        <div>
          <button onClick={() => navigate("/dashboard")}>回 Dashboard</button>{" "}
          <button onClick={() => navigate("/reflection")}>每日反思</button>{" "}
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            登出
          </button>
        </div>
      </div>

      {loading ? (
        <p>載入中...</p>
      ) : error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : (
        <>
          {/* 本週專注總時數折線圖 */}
          <section style={{ marginTop: 32, marginBottom: 40 }}>
            <h2>本週每日專注總時數（分鐘）</h2>
            <div style={{ width: "100%", height: 300, background: "#111", padding: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data7Days}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="focusMinutes"
                    stroke="#82ca9d"
                    name="專注分鐘"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 每日完成度折線圖 */}
          <section style={{ marginBottom: 40 }}>
            <h2>本週每日完成度（%）</h2>
            <div style={{ width: "100%", height: 300, background: "#111", padding: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data7Days}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="completionScore"
                    stroke="#8884d8"
                    connectNulls
                    name="完成度"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: 12, opacity: 0.8 }}>
              ※ 沒寫反思的那天會顯示空值（斷線）。
            </p>
          </section>
        </>
      )}
    </div>
  );
}
