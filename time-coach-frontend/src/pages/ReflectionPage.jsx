// src/pages/ReflectionPage.jsx
import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

function formatDateToYMD(date) {
  return date.toISOString().slice(0, 10);
}

export default function ReflectionPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const todayStr = formatDateToYMD(new Date());

  // 語音/文字輸入
  const [summaryInput, setSummaryInput] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);

  // AI 解析結果預覽
  const [preview, setPreview] = useState(null);

  // 儲存中
  const [saving, setSaving] = useState(false);

  // 歷史紀錄
  const [list, setList] = useState([]);
  const [error, setError] = useState("");

  // 🎤 語音輸入
  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("你的瀏覽器不支援語音輸入（建議使用 Chrome）");
      return;
    }

    setListening(true);

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setSummaryInput((prev) => prev + text);
      setListening(false);
    };

    recognition.onerror = (e) => {
      console.error("語音辨識錯誤：", e.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  };

  // AI 解析
  const handleParse = async () => {
    if (!summaryInput.trim()) {
      alert("請先輸入或說出今日總結");
      return;
    }

    setParsing(true);
    try {
      const res = await api.post("/api/reflections/parse", {
        text: summaryInput,
        date: todayStr,
      });
      setPreview(res.data.reflection);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "AI 解析失敗");
    } finally {
      setParsing(false);
    }
  };

  // 確認儲存
  const handleSave = async () => {
    if (!preview) return;

    setSaving(true);
    try {
      await api.post("/api/reflections", {
        date: todayStr,
        ...preview,
      });
      setPreview(null);
      setSummaryInput("");
      await fetchReflections();
      alert("反思紀錄已儲存！");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  // 取消預覽
  const handleCancel = () => {
    setPreview(null);
  };

  // 取得歷史紀錄
  const fetchReflections = async () => {
    try {
      const today = new Date();
      const end = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );
      const start = new Date(end);
      start.setDate(start.getDate() - 7);

      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);

      const res = await api.get(`/api/reflections?from=${from}&to=${to}`);
      setList(res.data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("取得反思紀錄失敗");
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchReflections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>每日反思</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-outline" onClick={() => navigate("/dashboard")}>回 Dashboard</button>
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

      {/* 簡化輸入區 */}
      <section className="glass-card" style={{ marginTop: 20 }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 18 }}>🗣️ 語音反思（{todayStr}）</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
          點「🎤 開始說」後說出今天的總結，例如：「我今天大部分任務都完成了，但下午有電話來所以報告沒寫完，明天要留更多彈性時間」
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className="btn-primary"
            onClick={startListening}
            disabled={listening || parsing}
            style={{
              background: listening ? "#ef4444" : "linear-gradient(135deg, #3b82f6, #2563eb)",
              minWidth: 120,
            }}
          >
            {listening ? "🔴 聆聽中..." : "🎤 開始說"}
          </button>
          <button
            className="btn-primary"
            onClick={handleParse}
            disabled={!summaryInput.trim() || parsing || listening}
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            }}
          >
            {parsing ? "🧠 解析中..." : "🧠 AI 解析"}
          </button>
        </div>

        <textarea
          value={summaryInput}
          onChange={(e) => setSummaryInput(e.target.value)}
          placeholder="也可以直接打字輸入今日總結..."
          style={{
            width: "100%",
            minHeight: 100,
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(148, 163, 184, 0.3)",
            borderRadius: 8,
            padding: 12,
            color: "white",
            fontSize: 14,
            resize: "vertical",
          }}
        />
      </section>

      {/* AI 解析預覽 */}
      {preview && (
        <section className="glass-card" style={{ marginTop: 16, borderColor: "#8b5cf6" }}>
          <h3 style={{ margin: "0 0 12px 0", color: "#a78bfa" }}>✨ AI 解析結果</h3>
          
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>完成度</label>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "#10b981" }}>
                {preview.completionScore}%
              </div>
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>😵 今天拖延/沒完成的</label>
              <div style={{ fontSize: 14 }}>{preview.mostProcrastinatedTask || "—"}</div>
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>✅ 今天做得不錯的</label>
              <div style={{ fontSize: 14 }}>{preview.whatWentWell || "—"}</div>
            </div>
            
            <div>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>💡 明天改善建議</label>
              <div style={{ fontSize: 14 }}>{preview.whatToImprove || "—"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              {saving ? "儲存中..." : "✅ 確認儲存"}
            </button>
            <button
              className="btn-outline"
              onClick={handleCancel}
              disabled={saving}
            >
              取消
            </button>
          </div>
        </section>
      )}

      {/* 歷史紀錄 */}
      <section style={{ marginTop: 32 }}>
        <h2>最近 7 天反思紀錄</h2>
        {error && <p style={{ color: "salmon" }}>{error}</p>}
        {list.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>目前還沒有反思紀錄。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {list.map((r) => (
              <div key={r._id} className="glass-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <strong>{new Date(r.date).toLocaleDateString("zh-TW")}</strong>
                  <span style={{ color: "#10b981", fontWeight: "bold" }}>
                    {r.completionScore ?? "—"}%
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  <div>😵 拖延：{r.mostProcrastinatedTask || "—"}</div>
                  <div>✅ 做得好：{r.whatWentWell || "—"}</div>
                  <div>💡 改善：{r.whatToImprove || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
