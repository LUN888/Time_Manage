import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    grade: "",
    major: "",
    procrastinationSelfRating: 5,
  });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/auth/register", form);
      navigate("/login");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "註冊失敗");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h1>註冊</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>姓名</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>密碼</label>
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>年級</label>
          <input
            name="grade"
            value={form.grade}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>科系</label>
          <input
            name="major"
            value={form.major}
            onChange={handleChange}
          />
        </div>
        <div>
          <label>自評拖延程度 (1-10)</label>
          <input
            name="procrastinationSelfRating"
            type="number"
            min="1"
            max="10"
            value={form.procrastinationSelfRating}
            onChange={handleChange}
          />
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit">註冊</button>
      </form>
      <p>
        已有帳號？ <Link to="/login">去登入</Link>
      </p>
    </div>
  );
}
