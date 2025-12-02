// src/pages/CoachPage.jsx
import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function CoachPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null); // { summary, strengths, improvements, nextActions }
  const [error, setError] = useState("");

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/coach/summary");
      setSummary(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "取得 AI 總結失敗");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>AI 時間教練</h1>
        <div>
          <button onClick={() => navigate("/dashboard")}>回 Dashboard</button>{" "}
          <button onClick={() => navigate("/stats")}>統計圖表</button>{" "}
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

      <p style={{ marginTop: 12 }}>
        按下下面的按鈕，AI 會自動讀你最近 7 天的「學習計畫、專注紀錄、每日反思」，幫你做一次總結與建議。
      </p>

      <button onClick={handleGenerateSummary} disabled={loading}>
        {loading ? "AI 分析中..." : "🧠 產生最近 7 天學習總結與建議"}
      </button>

      {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}

      {summary && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 8,
            border: "1px solid #555",
            background: "#111",
          }}
        >
          <h2>整體總結</h2>
          <p style={{ whiteSpace: "pre-line" }}>{summary.summary}</p>

          {summary.strengths && summary.strengths.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>這段時間你做得不錯的地方</h3>
              <ul>
                {summary.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {summary.improvements && summary.improvements.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>可以調整與改善的地方</h3>
              <ul>
                {summary.improvements.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {summary.nextActions && summary.nextActions.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>下週可以嘗試的具體行動</h3>
              <ul>
                {summary.nextActions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
