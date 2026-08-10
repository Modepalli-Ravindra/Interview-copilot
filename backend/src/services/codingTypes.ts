/**
 * Phase 5 — Shared types for the adaptive dynamic coding interview engine.
 *
 * These types describe the per-session coding interview state, its questions
 * and per-attempt history. The actual hidden test payloads live ONLY in the
 * server-side `CodingQuestionRecord.hiddenTestCases`; the frontend receives a
 * public projection (visible tests + `hiddenTestCount`).
 *
 * Reuses the existing `Difficulty` union from the coding engine (structural
 * equality keeps the two worlds interoperable).
 */

export type CodingDifficulty = 'Easy' | 'Medium' | 'Hard';

export type GeneratedQuestionSource = 'ai' | 'template';

export type CodingPerformanceClassification =
  | 'STRONG'
  | 'STABLE'
  | 'NEEDS_IMPROVEMENT'
  | 'UNRELIABLE';

export interface CodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface CodingTestCase {
  stdin: string;
  expected: string;
}

/** One "Run Tests" submission against a question. Never deleted. */
export interface CodingAttempt {
  attemptNumber: number;
  submittedCode: string;
  language: string;
  status: string;
  passedCount: number;
  totalCount: number;
  visiblePassedCount: number;
  visibleTotalCount: number;
  hiddenPassedCount: number;
  hiddenTotalCount: number;
  executionTimeMs: number | null;
  memoryKb: number | null;
  stderr: string | null;
  fromMock: boolean;
  createdAt: string;
}

/** Per-question record inside a coding interview. */
export interface CodingQuestionRecord {
  questionId: string;
  problemId: string;
  title: string;
  difficulty: CodingDifficulty;
  topic: string;
  concepts: string[];
  generatedSource: GeneratedQuestionSource;
  fromMock: boolean;
  language: string;
  startedAt: string | null;
  completedAt: string | null;

  problemStatement: string;
  constraints: string[];
  inputFormat: string;
  outputFormat: string;
  examples: CodingExample[];
  expectedComplexity: string;

  /** Visible test cases — safe to send to the candidate. */
  visibleTestCases: CodingTestCase[];
  /** Hidden test cases — server-side only, never sent to the client. */
  hiddenTestCases: CodingTestCase[];
  /** Count of hidden tests (the public projection exposes only this number). */
  hiddenTestCount: number;

  questionHash: string;

  attempts: CodingAttempt[];
  finalResult: CodingAttempt | null;
  hintsUsed: number;
  timeTakenMs: number | null;
}

/** Deterministic per-question / per-session performance signal. */
export interface CodingPerformanceSignal {
  questionId: string;
  topic: string;
  difficulty: CodingDifficulty;
  concepts: string[];
  passRate: number | null;
  visiblePassRate: number | null;
  hiddenPassRate: number | null;
  attempts: number;
  finalStatus: string | null;
  timeTakenMs: number | null;
  hintsUsed: number;
  fromMock: boolean;
  classification: CodingPerformanceClassification;
}

/** Public projection of a question — never contains hidden test payloads. */
export interface PublicCodingQuestion {
  questionId: string;
  problemId: string;
  title: string;
  difficulty: CodingDifficulty;
  topic: string;
  concepts: string[];
  generatedSource: GeneratedQuestionSource;
  fromMock: boolean;
  language: string;
  startedAt: string | null;
  problemStatement: string;
  constraints: string[];
  inputFormat: string;
  outputFormat: string;
  examples: CodingExample[];
  expectedComplexity: string;
  visibleTestCases: CodingTestCase[];
  hiddenTestCount: number;
  attemptsCount: number;
  hintsUsed: number;
  hintsAvailable: number;
  completed: boolean;
}

/** Public projection of the whole session — used by status/UI endpoints. */
export interface PublicCodingInterviewStatus {
  sessionId: string;
  questionNumber: number;
  targetQuestionCount: number;
  currentDifficulty: CodingDifficulty;
  currentQuestionId: string | null;
  startedAt: string | null;
  completed: boolean;
  questions: Array<{
    questionId: string;
    title: string;
    difficulty: CodingDifficulty;
    topic: string;
    concepts: string[];
    status: 'pending' | 'active' | 'completed';
    passedCount: number;
    totalCount: number;
    fromMock: boolean;
    hintsUsed: number;
  }>;
}

/** Aggregated performance summary used by the feedback report. */
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
  signals: CodingPerformanceSignal[];
  hasReliableSignal: boolean;
}

/** Per-question entry of the coding-interview feedback report (server-computed truth). */
export interface CodingInterviewQuestionReport {
  questionId: string;
  title: string;
  difficulty: CodingDifficulty;
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

/**
 * Server-computed coding-interview section of the feedback report.
 *
 * Always attached verbatim by the backend — the AI prompt explicitly forbids
 * changing these numbers, and the server overwrites whatever the AI returns.
 * `hasVerifiedExecution` is false when every question ran on the offline
 * fallback, so the UI can surface "UNVERIFIED" instead of claiming passes.
 */
export interface CodingInterviewReport {
  metrics: CodingInterviewMetrics;
  questions: CodingInterviewQuestionReport[];
  verifiedQuestionCount: number;
  mockQuestionCount: number;
  hasVerifiedExecution: boolean;
  language: string;
}
