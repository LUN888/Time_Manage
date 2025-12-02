// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ReflectionPage from "./pages/ReflectionPage";
import CoachPage from "./pages/CoachPage";
import StatsPage from "./pages/StatsPage";


function PrivateRoute({ children }) {
  const { token } = useAuth();
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

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
 