import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Auth is wired up after integrations — skip for now */}
        <Route path="/auth" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<DashboardLayout />}>
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

        <Route path="/interview/:sessionId" element={<InterviewPage />} />
        <Route path="/coding-interview" element={<CodingInterviewPage />} />
        <Route path="/coding-interview/:sessionId" element={<CodingInterviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
