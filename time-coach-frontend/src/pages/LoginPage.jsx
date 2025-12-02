import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/api/auth/login", form);
      login(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "登入失敗");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h1>登入</h1>
      <form onSubmit={handleSubmit}>
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
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit">登入</button>
      </form>
      <p>
        沒帳號？ <Link to="/register">去註冊</Link>
      </p>
    </div>
  );
}
