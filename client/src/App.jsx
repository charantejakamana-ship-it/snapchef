import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
        <p className="text-sm font-medium text-slate-500">Warming the pans…</p>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <div className="aurora min-h-screen">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<GuestOnly><Auth mode="login" /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><Auth mode="signup" /></GuestOnly>} />
        <Route path="/app" element={<Protected><Dashboard /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
