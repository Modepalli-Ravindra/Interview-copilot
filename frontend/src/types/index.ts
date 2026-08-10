export type InterviewMode =
  | 'BEHAVIORAL'
  | 'CODING'
  | 'PROJECT'
  | 'SYSTEM_DESIGN'
  | 'TECHNICAL'
  | 'HR'
  | 'MIXED'
  | 'RESUME_BASED'
  | 'JD_BASED'
  | 'SKILLS_BASED'
  | 'CODING_INTERVIEW';

export type InterviewDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface InterviewSession {
  id: string;
  mode: InterviewMode;
  difficulty?: InterviewDifficulty;
  status: 'SETUP' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  startedAt?: string | null;
  role?: string;
  company?: string;
  score?: number | null;
  durationMs?: number | null;
  skills?: string[];
  resumeFileKey?: string | null;
  resumeFileUrl?: string | null;
  resumeFileName?: string | null;
  githubSummary?: string;
  githubAnalysis?: string;
  githubAnalyzedAt?: string | null;
  projectProfileData?: ProjectProfile | null;
  projectIndex?: ProjectIndexEntry[] | null;
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
  /** Split counts so the UI can show visible vs hidden separately. */
  visiblePassedCount?: number;
  visibleTotalCount?: number;
  hiddenPassedCount?: number;
  hiddenTotalCount?: number;
  fromMock: boolean;
}

export interface FeedbackGap {
  topic: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
  category?: 'technical' | 'resume' | 'jd' | 'project' | 'communication' | 'behavioral';
}

export interface CodingPerformance {
  problemTitle?: string;
  language?: string;
  execution: string;
  status?: string;
  passedCount?: number;
  totalCount?: number;
  timeMs?: number | null;
  memoryKb?: number | null;
  verified: boolean;
  strengths: string[];
  weaknesses: string[];
  complexity?: string;
  recommendation: string[];
}

export interface FeedbackReport {
  sessionId?: string;
  summary: string;
  score: number;
  breakdown: Array<{ label: string; value: number }>;
  dimensions?: Array<{ label: string; value: number }>;
  strengths: string[];
  gaps: FeedbackGap[];
  tips: string[];
  nextTopics: string[];
  strongAnswers?: string[];
  weakAnswers?: string[];
  recommendedCodingPractice?: string[];
  recommendedInterviewQuestions?: string[];
  betterAnswer?: string;
  codingPerformance?: CodingPerformance;
  contextUsed?: {
    resume: boolean;
    jd: boolean;
    skills: string[];
    github: boolean;
    match?: boolean;
    difficulty?: string | null;
  };
  feedbackSource?: 'ai' | 'fallback' | 'mock';
  provider?: string | null;
  model?: string | null;
  gateway?: string | null;
  fallbackReason?: string | null;
  codingInterview?: CodingInterviewReport | null;
  generatedAt: string;
}

export interface RoadmapStep {
  id?: string;
  title: string;
  desc: string;
  timeEstimate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'in-progress' | 'pending' | 'completed';
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

// ── Resume & JD intelligence (Phase 2) ──────────────────────

export type SkillCategory =
  | 'Programming'
  | 'Frontend'
  | 'Backend'
  | 'Database'
  | 'Cloud'
  | 'AI/ML'
  | 'DevOps'
  | 'Testing'
  | 'Tools'
  | 'Data'
  | 'Mobile'
  | 'Blockchain'
  | 'Security'
  | 'Networking'
  | 'Design'
  | 'Soft Skills';

export interface ExtractedSkill {
  skill: string;
  category: SkillCategory;
  confidence: number;
  source: string;
}

export interface ResumePersonal {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export interface ResumeEducation {
  degree: string;
  university: string;
  specialization: string;
  graduationYear: string;
  cgpa: string;
}

export interface ResumeWorkExperience {
  company: string;
  role: string;
  duration: string;
  responsibilities: string[];
  technologies: string[];
}

export interface ResumeProject {
  title: string;
  description: string;
  technologies: string[];
  responsibilities: string[];
  outcomes: string[];
}

export interface ResumeCertification {
  name: string;
  issuer: string;
  date: string;
}

export interface ResumeProfile {
  personal: ResumePersonal;
  summary: string;
  education: ResumeEducation[];
  skills: string[];
  skillDetails: ExtractedSkill[];
  experience: ResumeWorkExperience[];
  internships: ResumeWorkExperience[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];
  rawText: string;
}

export interface JdProfile {
  role: string;
  company: string;
  location: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experience: string;
  educationRequirements: string[];
  toolsTechnologies: string[];
  behavioralRequirements: string[];
  skillDetails: ExtractedSkill[];
  rawText: string;
}

export interface MatchSkill {
  skill: string;
  category: string;
  source: 'resume' | 'jd' | 'both';
}

export interface PartialMatchSkill {
  skill: string;
  category: string;
  relatedSkill: string;
  source: 'jd';
}

export interface MatchArea {
  category: string;
  score: number;
}

export interface MatchReport {
  overallMatch: number;
  skillMatch: number;
  experienceMatch: number;
  experienceInsufficient?: boolean;
  projectMatch: number;
  keywordMatch: number;
  matchedSkills: MatchSkill[];
  partiallyMatchedSkills: PartialMatchSkill[];
  missingSkills: MatchSkill[];
  strongAreas: MatchArea[];
  weakAreas: MatchArea[];
  preparationTopics: string[];
  recommendedTopics?: string[];
  generatedAt: string;
}

export interface IntelligenceSource {
  filename: string;
  fileType: 'pdf' | 'text';
}

export interface ResumeParseResult {
  profile: ResumeProfile;
  skills: ExtractedSkill[];
  text: string;
  source: IntelligenceSource;
  resumeFileKey?: string | null;
  resumeFileUrl?: string | null;
  storageConfigured?: boolean;
}

export interface JdParseResult {
  profile: JdProfile;
  text: string;
  source: IntelligenceSource;
}

export interface MatchResultResponse {
  match: MatchReport;
  resumeProfile: ResumeProfile;
  jdProfile: JdProfile;
}

// ── Candidates pipeline (Phase 3) ────────────────────────────

export interface CandidateSummary {
  id: string;
  name: string;
  email: string;
  sessionCount: number;
  completedCount: number;
  avgScore: number | null;
  lastActive: string | null;
  latestStatus: string | null;
  latestMode: string | null;
  modes: Record<string, number>;
  statuses: Record<string, number>;
  scoreTrend: Array<{ createdAt: string; score: number | null }>;
}

// ── Dynamic coding generation (Phase 3) ──────────────────────

export interface GeneratedQuestion {
  id: string;
  title: string;
  problemStatement: string;
  constraints: string[];
  inputFormat: string;
  outputFormat: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  expectedComplexity: string;
  testCases: Array<{ stdin: string; expected: string }>;
  hiddenTestCases: Array<{ stdin: string; expected: string }>;
  language: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topic: string;
  source: 'ai' | 'template';
  date: string;
}

export interface GeneratedQuestionResponse {
  question: GeneratedQuestion;
  fromMock: boolean;
  attempts: number;
  dupRejected: number;
  generatedCount: number;
}

// ── GitHub project analyzer (Phase 4) ────────────────────────

export type RepoAnalysisErrorCode =
  | 'INVALID_URL'
  | 'NOT_FOUND'
  | 'PRIVATE'
  | 'RATE_LIMITED'
  | 'EMPTY'
  | 'FETCH';

export interface RepoFile {
  path: string;
  content: string;
}

export type FileCategory =
  | 'IMPORTANT_SOURCE'
  | 'SOURCE'
  | 'CONFIGURATION'
  | 'DOCUMENTATION'
  | 'TEST'
  | 'BUILD'
  | 'GENERATED'
  | 'DEPENDENCY'
  | 'ASSET'
  | 'IGNORED';

export interface TechnologyProfile {
  frontend: string[];
  backend: string[];
  database: string[];
  programmingLanguages: string[];
  frameworks: string[];
  libraries: string[];
  devops: string[];
  testing: string[];
  other: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
}

export interface ArchitectureProfile {
  architecture: string[];
  entryPoints: string[];
  apiEndpoints: ApiEndpoint[];
  dataModels: string[];
  modules: string[];
  patterns: string[];
}

export interface EvidenceItem {
  claim: string;
  files: string[];
}

export interface ReadmeAnalysis {
  summary: string;
  sections: string[];
  claims: EvidenceItem[];
  trusted: boolean;
  notes: string[];
}

export interface ProjectIndexEntry {
  path: string;
  type: FileCategory;
  language: string | null;
  importance: 'high' | 'medium' | 'low';
  summary: string;
  symbols: string[];
  technologies: string[];
  relatedFiles: string[];
}

export interface ProjectQuestion {
  id: string;
  category: string;
  question: string;
  groundedIn: string[];
}

export interface FollowUpItem {
  topic: string;
  prompts: string[];
  groundedIn: string[];
}

export interface RepoConsistency {
  overall: 'aligned' | 'partially-aligned' | 'diverged';
  score: number;
  matches: Array<{ resumeSkill: string; githubEvidence: string[]; note: string }>;
  gaps: Array<{ resumeSkill: string; note: string }>;
  summary: string;
}

export interface ProjectRelevance {
  overall: 'high' | 'medium' | 'low';
  score: number;
  relevantAreas: Array<{ jdRequirement: string; githubEvidence: string[] }>;
  missingAreas: Array<{ jdRequirement: string; note: string }>;
  summary: string;
}

export interface ProjectProfile {
  repoUrl: string;
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null;
  primaryLanguage: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  sizeKb: number;
  topics: string[];
  isArchived: boolean;
  isPrivate: boolean;
  ownerType: string | null;
  defaultBranch: string;
  languages: string[];
  languagesBreakdown: Record<string, number>;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
  analyzedAt: string;
  readme: ReadmeAnalysis;
  fileCount: number;
  fileTree: string[];
  fileCategories: Record<FileCategory, string[]>;
  technologyProfile: TechnologyProfile;
  architecture: ArchitectureProfile;
  sourceFiles: RepoFile[];
  configFiles: RepoFile[];
  projectIndex: ProjectIndexEntry[];
  evidence: EvidenceItem[];
  apiEndpoints: ApiEndpoint[];
  entryPoints: string[];
  dataModels: string[];
  scripts: Record<string, string>;
  testingStrategy: string[];
  deployStrategy: string[];
  risks: string[];
  summary: string;
  questions: ProjectQuestion[];
  followUps: FollowUpItem[];
}

export interface ProjectAnalysisResponse {
  profile: ProjectProfile;
  consistency?: RepoConsistency;
  relevance?: ProjectRelevance;
  fromCache: boolean;
}

export interface ProjectRetrievalContext {
  files: string[];
  summary: string;
  relatedQuestions: string[];
}

export interface ProjectQuestionBankResponse {
  questions: ProjectQuestion[];
  followUps: FollowUpItem[];
  categories: string[];
}

// Phase 4 fields carried on a session (added to InterviewSession above).
export interface SessionProjectFields {
  projectProfileData?: ProjectProfile | null;
  projectIndex?: ProjectIndexEntry[] | null;
  githubSummary?: string;
  githubAnalysis?: string;
  githubAnalyzedAt?: string | null;
}

// ── Adaptive coding interview (Phase 5) ──────────────────────

export type CodingPerformanceClassification =
  | 'STRONG'
  | 'STABLE'
  | 'NEEDS_IMPROVEMENT'
  | 'UNRELIABLE';

export interface CodingInterviewQuestionSummary {
  questionId: string;
  title: string;
  difficulty: InterviewDifficulty;
  topic: string;
  concepts: string[];
  status: 'pending' | 'active' | 'completed';
  passedCount: number;
  totalCount: number;
  fromMock: boolean;
  hintsUsed: number;
}

export interface PublicCodingQuestion {
  questionId: string;
  problemId: string;
  title: string;
  difficulty: InterviewDifficulty;
  topic: string;
  concepts: string[];
  generatedSource: 'ai' | 'template';
  fromMock: boolean;
  language: string;
  startedAt: string | null;
  problemStatement: string;
  constraints: string[];
  inputFormat: string;
  outputFormat: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  expectedComplexity: string;
  visibleTestCases: Array<{ stdin: string; expected: string }>;
  hiddenTestCount: number;
  attemptsCount: number;
  hintsUsed: number;
  hintsAvailable: number;
  completed: boolean;
}

export interface CodingInterviewStatus {
  sessionId: string;
  questionNumber: number;
  targetQuestionCount: number;
  currentDifficulty: InterviewDifficulty;
  currentQuestionId: string | null;
  startedAt: string | null;
  completed: boolean;
  questions: CodingInterviewQuestionSummary[];
}

export interface CodingInterviewQuestionReport {
  questionId: string;
  title: string;
  difficulty: InterviewDifficulty;
  topic: string;
  concepts: string[];
  classification: CodingPerformanceClassification;
  status: 'pending' | 'active' | 'completed';
  attempts: number;
  hintsUsed: number;
  passedCount: number;
  totalCount: number;
  hiddenPassedCount: number;
  hiddenTotalCount: number;
  timeTakenMs: number | null;
  fromMock: boolean;
  language: string;
}

export interface CodingInterviewMetrics {
  questionsAttempted: number;
  questionsSolved: number;
  totalTestsPassed: number;
  totalTests: number;
  hiddenTestsPassed: number;
  hiddenTests: number;
  averageAttempts: number;
  averageTimeMs: number;
  masteredTopics: string[];
  practiceTopics: string[];
  strongAreas: string[];
  weakAreas: string[];
  overallScore: number;
  hasReliableSignal: boolean;
}

export interface CodingInterviewReport {
  metrics: CodingInterviewMetrics;
  questions: CodingInterviewQuestionReport[];
  verifiedQuestionCount: number;
  mockQuestionCount: number;
  hasVerifiedExecution: boolean;
  language: string;
}
