import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

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

