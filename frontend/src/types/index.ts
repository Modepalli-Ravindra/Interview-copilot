export interface InterviewSession {
  id: string;
  mode: 'BEHAVIORAL' | 'CODING' | 'PROJECT' | 'SYSTEM_DESIGN' | 'TECHNICAL';
  status: 'SETUP' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  startedAt?: string | null;
  role?: string;
  company?: string;
  score?: number | null;
  durationMs?: number | null;
}

export interface TranscriptEntry {
  id: string;
  sender: 'interviewer' | 'candidate' | 'teaching' | 'system';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export type CodeStatus = 'ACCEPTED' | 'WRONG_ANSWER' | 'TIME_LIMIT_EXCEEDED' | 'RUNTIME_ERROR' | 'COMPILATION_ERROR';

export interface CodeExecutionResult {
  status: CodeStatus;
  stdout: string | null;
  stderr: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  passedCount: number;
  totalCount: number;
  fromMock: boolean;
}

export interface FeedbackGap {
  topic: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
}

export interface FeedbackReport {
  sessionId?: string;
  summary: string;
  score: number;
  breakdown: Array<{ label: string; value: number }>;
  strengths: string[];
  gaps: FeedbackGap[];
  tips: string[];
  nextTopics: string[];
  generatedAt: string;
}

export interface RoadmapStep {
  title: string;
  desc: string;
  timeEstimate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'in-progress' | 'pending';
}

export interface Roadmap {
  title: string;
  summary: string;
  steps: RoadmapStep[];
  generatedAt: string;
}

export interface DashboardData {
  stats: {
    totalInterviews: number;
    avgScore: number | null;
    totalMinutes: number;
    byMode: Record<string, number>;
    topFocusAreas: string[];
  };
  recentSessions: Array<{
    id: string;
    role: string;
    company: string;
    mode: string;
    date: string;
    score: number | null;
  }>;
  roadmap: Roadmap | null;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  acceptance: number;
  minutes: number;
  statement: string;
  testCases: Array<{ stdin: string; expected: string }>;
}

export interface RepoDetail {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  defaultBranch: string;
  languages: string[];
  readme: string | null;
  fileTree: string[];
  topFiles: Array<{ path: string; content: string }>;
}

export interface GitHubProfile {
  username: string;
  name: string;
  avatar: string;
  bio: string;
  followers: number;
  publicRepos: number;
  topLanguages: string[];
  topRepos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    url: string;
  }>;
  totalStars: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'candidate' | 'recruiter' | 'admin';
}
