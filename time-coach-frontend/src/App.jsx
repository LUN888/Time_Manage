// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ReflectionPage from "./pages/ReflectionPage";
import CoachPage from "./pages/CoachPage";
import StatsPage from "./pages/StatsPage";
import CalendarPage from "./pages/CalendarPage";


function PrivateRoute({ children }) {
  const { token, isLoading } = useAuth();
  
  // 等待 localStorage 讀取完成
  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>載入中...</div>;
  }
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />

          <Route
            path="/reflection"
            element={
          <PrivateRoute>
          <ReflectionPage />
          </PrivateRoute>}/>

          <Route
            path="/coach"
            element={
            <PrivateRoute>
              <CoachPage />
            </PrivateRoute>
            }/>
          
          <Route
            path="/stats"
            element={
            <PrivateRoute>
          <StatsPage />
          </PrivateRoute>}/>

          <Route
            path="/calendar"
            element={
              <PrivateRoute>
                <CalendarPage />
              </PrivateRoute>
            }
          />        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
 