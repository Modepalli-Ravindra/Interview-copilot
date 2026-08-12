import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import InterviewsPage from './pages/InterviewsPage';
import MatchingPage from './pages/MatchingPage';
import CodingPage from './pages/CodingPage';
import RoadmapPage from './pages/RoadmapPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import CandidatesPage from './pages/CandidatesPage';
import GithubProjectPage from './pages/GithubProjectPage';
import InterviewPage from './pages/InterviewPage';
import CodingInterviewPage from './pages/CodingInterviewPage';

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center',
      background: 'hsl(220 15% 5%)', color: 'hsl(210 10% 85%)', fontFamily: 'var(--font-sans, sans-serif)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          border: '4px solid hsl(215 15% 15%)', borderTop: '4px solid hsl(174 85% 65%)',
          borderRadius: '50%', width: 40, height: 40, animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Verifying credentials...</div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RootRoute() {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />

          {/* Private Routes */}
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="interviews" element={<InterviewsPage />} />
            <Route path="match" element={<MatchingPage />} />
            <Route path="coding" element={<CodingPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="github" element={<GithubProjectPage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="/interview/:sessionId" element={<RequireAuth><InterviewPage /></RequireAuth>} />
          <Route path="/coding-interview" element={<RequireAuth><CodingInterviewPage /></RequireAuth>} />
          <Route path="/coding-interview/:sessionId" element={<RequireAuth><CodingInterviewPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

