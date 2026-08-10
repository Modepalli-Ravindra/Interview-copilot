/**
 * Phase 5 — Per-session coding interview state manager.
 *
 * The state lives on the session record as `session.codingInterview` (JSON
 * object). This reuses the existing pluggable session store (Supabase/Postgres
 * jsonb or the local JSON file), so a coding interview survives backend
 * restarts without a new storage stack. The global `questionStore` keeps
 * working for cross-session deduplication.
 *
 * The state NEVER overwrites `session.coding` — that legacy single-problem
 * field continues to serve practice mode untouched.
 */

import { getSessionRecord, updateSessionRecord } from '../routes/sessions';
import type {
  CodingAttempt,
  CodingDifficulty,
  CodingQuestionRecord,
  PublicCodingInterviewStatus,
  PublicCodingQuestion,
} from './codingTypes';
import { analyzeQuestion, decideNextDifficulty, type DifficultyDecision } from './codingAdaptive';
import { HINTS_PER_QUESTION } from './codingHints';
import { randomUUID } from 'crypto';

export const QUESTION_COUNT_OPTIONS = [3, 5, 7];
export const DEFAULT_QUESTION_COUNT = 5;

export interface CodingInterviewStateRecord {
  sessionId: string;
  currentQuestionId: string | null;
  questionNumber: number;
  targetQuestionCount: number;
  currentDifficulty: CodingDifficulty;
  startedAt: string | null;
  completed: boolean;
  questions: CodingQuestionRecord[];
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  reliableQuestionCount: number;
  failedConcepts: string[];
  masteredConcepts: string[];
  lastDecision: DifficultyDecision | null;
}

export function normalizeQuestionCount(n: unknown): number {
  const parsed = Number(n);
  if (Number.isInteger(parsed) && QUESTION_COUNT_OPTIONS.includes(parsed)) return parsed;
  return DEFAULT_QUESTION_COUNT;
}

export function createCodingInterviewState(
  sessionId: string,
  targetQuestionCount: number,
  startDifficulty: CodingDifficulty,
): CodingInterviewStateRecord {
  return {
    sessionId,
    currentQuestionId: null,
    questionNumber: 0,
    targetQuestionCount: normalizeQuestionCount(targetQuestionCount),
    currentDifficulty: startDifficulty || 'Medium',
    startedAt: new Date().toISOString(),
    completed: false,
    questions: [],
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    reliableQuestionCount: 0,
    failedConcepts: [],
    masteredConcepts: [],
    lastDecision: null,
  };
}

export function loadCodingInterviewState(sessionId: string): CodingInterviewStateRecord | null {
  const session = getSessionRecord(sessionId);
  if (!session) return null;
  const state = session.codingInterview as CodingInterviewStateRecord | undefined;
  if (!state || typeof state !== 'object') return null;
  return state;
}

export function saveCodingInterviewState(state: CodingInterviewStateRecord): void {
  updateSessionRecord(state.sessionId, { codingInterview: state });
}

export function getOrCreateCodingInterviewState(
  sessionId: string,
  targetQuestionCount?: number,
  startDifficulty?: CodingDifficulty,
): CodingInterviewStateRecord {
  const existing = loadCodingInterviewState(sessionId);
  if (existing) return existing;
  const session = getSessionRecord(sessionId);
  const initialDifficulty: CodingDifficulty =
    startDifficulty || (session?.difficulty as CodingDifficulty) || 'Medium';
  const state = createCodingInterviewState(sessionId, targetQuestionCount || DEFAULT_QUESTION_COUNT, initialDifficulty);
  saveCodingInterviewState(state);
  return state;
}

/** Convert a generated CodingQuestion into a stored record. */
export function buildQuestionRecord(question: {
  id: string;
  title: string;
  difficulty: CodingDifficulty;
  topic: string;
  concepts?: string[];
  source: 'ai' | 'template';
  language: string;
  problemStatement: string;
  constraints: string[];
  inputFormat: string;
  outputFormat: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  expectedComplexity: string;
  testCases: Array<{ stdin: string; expected: string }>;
  hiddenTestCases: Array<{ stdin: string; expected: string }>;
  questionHash: string;
  date: string;
}): CodingQuestionRecord {
  return {
    questionId: randomUUID(),
    problemId: question.id,
    title: question.title,
    difficulty: question.difficulty,
    topic: question.topic,
    concepts: Array.isArray(question.concepts) ? question.concepts.slice(0, 6) : [],
    generatedSource: question.source,
    fromMock: question.source === 'template',
    language: question.language,
    startedAt: null,
    completedAt: null,
    problemStatement: question.problemStatement,
    constraints: question.constraints || [],
    inputFormat: question.inputFormat || '',
    outputFormat: question.outputFormat || '',
    examples: question.examples || [],
    expectedComplexity: question.expectedComplexity || '',
    visibleTestCases: (question.testCases || []).slice(0, 3),
    hiddenTestCases: (question.hiddenTestCases || []).slice(0, 4),
    hiddenTestCount: (question.hiddenTestCases || []).length,
    questionHash: question.questionHash,
    attempts: [],
    finalResult: null,
    hintsUsed: 0,
    timeTakenMs: null,
  };
}

/** Activate a question: append to state, stamp startedAt, set current index. */
export function activateQuestion(state: CodingInterviewStateRecord, record: CodingQuestionRecord): void {
  if (state.completed) throw new Error('coding interview already completed');
  if (state.questions.length >= state.targetQuestionCount) throw new Error('coding interview is full');
  record.startedAt = new Date().toISOString();
  state.questions.push(record);
  state.currentQuestionId = record.questionId;
  state.questionNumber = state.questions.length;
  saveCodingInterviewState(state);
}

/** The currently active (incomplete) question record, if any. */
export function getActiveQuestion(state: CodingInterviewStateRecord): CodingQuestionRecord | null {
  if (!state.currentQuestionId) return null;
  const q = state.questions.find((x) => x.questionId === state.currentQuestionId);
  if (!q) return null;
  if (q.completedAt) return null;
  return q;
}

export function findQuestion(state: CodingInterviewStateRecord, questionId: string): CodingQuestionRecord | null {
  return state.questions.find((q) => q.questionId === questionId) || null;
}

/** Append a verified execution attempt to a question (never deletes prior attempts). */
export function appendAttempt(
  state: CodingInterviewStateRecord,
  questionId: string,
  attempt: Omit<CodingAttempt, 'attemptNumber' | 'createdAt'>,
): CodingAttempt | null {
  const question = findQuestion(state, questionId);
  if (!question) return null;
  const full: CodingAttempt = {
    ...attempt,
    attemptNumber: question.attempts.length + 1,
    createdAt: new Date().toISOString(),
  };
  question.attempts.push(full);
  question.finalResult = full;
  saveCodingInterviewState(state);
  return full;
}

export interface CompletionResult {
  state: CodingInterviewStateRecord;
  signal: ReturnType<typeof analyzeQuestion>;
  decision: DifficultyDecision;
  completed: boolean;
}

/**
 * Complete the active question: stamp timing, analyze the verified
 * performance, update adaptive bookkeeping (consecutive streaks, reliable
 * count, failed/mastered concepts) and decide the NEXT difficulty.
 *
 * Returns the decision so the caller can surface a benign message.
 */
export function completeQuestion(state: CodingInterviewStateRecord): CompletionResult | null {
  const question = getActiveQuestion(state);
  if (!question) return null;

  question.completedAt = new Date().toISOString();
  if (question.startedAt) {
    question.timeTakenMs = new Date(question.completedAt).getTime() - new Date(question.startedAt).getTime();
  }

  const signal = analyzeQuestion(question);

  // Adaptive bookkeeping — reliable signals only.
  if (signal.classification === 'UNRELIABLE' || signal.fromMock) {
    state.consecutiveSuccesses = 0;
    state.consecutiveFailures = 0;
  } else if (signal.classification === 'STRONG') {
    state.consecutiveSuccesses += 1;
    state.consecutiveFailures = 0;
    state.reliableQuestionCount += 1;
    for (const c of signal.concepts) if (!state.masteredConcepts.includes(c)) state.masteredConcepts.push(c);
  } else if (signal.classification === 'NEEDS_IMPROVEMENT') {
    state.consecutiveFailures += 1;
    state.consecutiveSuccesses = 0;
    state.reliableQuestionCount += 1;
    for (const c of signal.concepts) if (!state.failedConcepts.includes(c)) state.failedConcepts.push(c);
  } else {
    // STABLE — neutral, reset streaks.
    state.consecutiveSuccesses = 0;
    state.consecutiveFailures = 0;
    state.reliableQuestionCount += 1;
  }

  const decision = decideNextDifficulty(state.currentDifficulty, signal, {
    consecutiveSuccesses: state.consecutiveSuccesses,
    consecutiveFailures: state.consecutiveFailures,
  });
  state.lastDecision = decision;
  state.currentDifficulty = decision.difficulty;
  state.currentQuestionId = null;

  const completed = state.questions.length >= state.targetQuestionCount;
  if (completed) state.completed = true;

  saveCodingInterviewState(state);
  return { state, signal, decision, completed };
}

/** Public projection of one question — hidden test payloads never leave the server. */
export function toPublicQuestion(question: CodingQuestionRecord): PublicCodingQuestion {
  return {
    questionId: question.questionId,
    problemId: question.problemId,
    title: question.title,
    difficulty: question.difficulty,
    topic: question.topic,
    concepts: question.concepts,
    generatedSource: question.generatedSource,
    fromMock: question.fromMock,
    language: question.language,
    startedAt: question.startedAt,
    problemStatement: question.problemStatement,
    constraints: question.constraints,
    inputFormat: question.inputFormat,
    outputFormat: question.outputFormat,
    examples: question.examples,
    expectedComplexity: question.expectedComplexity,
    visibleTestCases: question.visibleTestCases,
    hiddenTestCount: question.hiddenTestCount,
    attemptsCount: question.attempts.length,
    hintsUsed: question.hintsUsed,
    hintsAvailable: HINTS_PER_QUESTION,
    completed: Boolean(question.completedAt),
  };
}

/** Public projection of the whole session status. */
export function toPublicStatus(state: CodingInterviewStateRecord): PublicCodingInterviewStatus {
  return {
    sessionId: state.sessionId,
    questionNumber: state.questionNumber,
    targetQuestionCount: state.targetQuestionCount,
    currentDifficulty: state.currentDifficulty,
    currentQuestionId: state.currentQuestionId,
    startedAt: state.startedAt,
    completed: state.completed,
    questions: state.questions.map((q) => ({
      questionId: q.questionId,
      title: q.title,
      difficulty: q.difficulty,
      topic: q.topic,
      concepts: q.concepts,
      status: q.completedAt ? 'completed' : q.questionId === state.currentQuestionId ? 'active' : 'pending',
      passedCount: q.finalResult ? q.finalResult.passedCount : 0,
      totalCount: q.finalResult ? q.finalResult.totalCount : 0,
      fromMock: q.fromMock,
      hintsUsed: q.hintsUsed,
    })),
  };
}

export function isInterviewModeActive(sessionId: string): boolean {
  const state = loadCodingInterviewState(sessionId);
  return Boolean(state && !state.completed && state.questions.length > 0);
}
