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

  const [form, setForm] = useState({
    date: todayStr,
    completionScore: 70,
    mostProcrastinatedTask: "",
    whatWentWell: "",
    whatToImprove: "",
  });

  const [saving, setSaving] = useState(false);
  const [list, setList] = useState([]);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/reflections", {
        ...form,
        completionScore: Number(form.completionScore),
      });
      await fetchReflections();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "送出反思失敗");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>每日反思</h1>
        <div>
          <button onClick={() => navigate("/dashboard")}>回 Dashboard</button>{" "}
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

      <form onSubmit={handleSubmit} style={{ marginBottom: 32 }}>
        <div>
          <label>日期</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>今天完成度（0–100）</label>
          <input
            type="number"
            name="completionScore"
            min="0"
            max="100"
            value={form.completionScore}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>今天最拖延的是什麼？</label>
          <textarea
            name="mostProcrastinatedTask"
            value={form.mostProcrastinatedTask}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>今天做得不錯的是什麼？</label>
          <textarea
            name="whatWentWell"
            value={form.whatWentWell}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>明天想改善哪一點？</label>
          <textarea
            name="whatToImprove"
            value={form.whatToImprove}
            onChange={handleChange}
          />
        </div>
        <button type="submit" disabled={saving}>
          {saving ? "送出中..." : "送出今日反思"}
        </button>
      </form>

      <h2>最近 7 天反思紀錄</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {list.length === 0 ? (
        <p>目前還沒有反思紀錄。</p>
      ) : (
        <ul>
          {list.map((r) => (
            <li key={r._id} style={{ marginBottom: 12 }}>
              <strong>
                {new Date(r.date).toLocaleDateString()} 完成度{" "}
                {r.completionScore ?? "-"}%
              </strong>
              <div>最拖延：{r.mostProcrastinatedTask || "—"}</div>
              <div>做得好：{r.whatWentWell || "—"}</div>
              <div>想改善：{r.whatToImprove || "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
