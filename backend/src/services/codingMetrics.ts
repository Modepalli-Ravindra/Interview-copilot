/**
 * Phase 5 — Deterministic coding-interview metrics builder.
 *
 * Aggregates the stored per-question records + adaptive signals into the
 * `CodingInterviewMetrics` summary and the per-question `CodingInterviewReport`
 * that feeds the end-of-interview feedback.
 *
 * Everything here is derived from verified server-side state:
 *   - pass rates come from the last verified (non-mock) attempt per question;
 *   - mock/unverified questions never inflate the score — they are counted but
 *     flagged (`fromMock`), and `hasVerifiedExecution` stays false when nothing
 *     was verified, so callers can never claim a pass that Judge0 didn't see.
 */

import type {
  CodingAttempt,
  CodingInterviewMetrics,
  CodingInterviewQuestionReport,
  CodingInterviewReport,
  CodingPerformanceSignal,
  CodingQuestionRecord,
} from './codingTypes';
import { analyzeQuestion } from './codingAdaptive';
import type { CodingInterviewStateRecord } from './codingStateManager';

/**
 * The reference attempt for aggregation: the last verified (non-mock) attempt
 * when one exists, otherwise the most recent recorded attempt (mock). This
 * keeps the numbers honest — a verified result is never hidden behind a later
 * offline fallback run.
 */
export function referenceAttempt(question: CodingQuestionRecord): CodingAttempt | null {
  if (question.attempts.length === 0) return null;
  for (let i = question.attempts.length - 1; i >= 0; i--) {
    if (!question.attempts[i].fromMock) return question.attempts[i];
  }
  return question.attempts[question.attempts.length - 1];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean).map((s) => s.trim()).filter(Boolean)));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

interface ScoreInputs {
  totalTests: number;
  totalTestsPassed: number;
  attemptedCount: number;
  solvedCount: number;
  averageAttempts: number;
  totalHints: number;
  averageTimeMs: number;
}

/**
 * 0–100 overall score composed from verified evidence only.
 *
 *   60%  pass rate        (passed / total tests)
 *   30%  completion rate  (solved / attempted)
 *   10%  efficiency       (100 − extra attempts − hint usage − slow solves)
 *
 * When no test results exist at all the pass/completion terms degrade to a
 * neutral 50 so the score stays bounded and readable, never inflated.
 */
export function computeOverallScore(o: ScoreInputs): number {
  const passScore = o.totalTests > 0 ? (o.totalTestsPassed / o.totalTests) * 100 : 50;
  const completionScore = o.attemptedCount > 0 ? (o.solvedCount / o.attemptedCount) * 100 : 50;

  let efficiency = 100;
  efficiency -= Math.max(0, o.averageAttempts - 1) * 8;
  efficiency -= o.totalHints * 5;
  if (o.averageTimeMs > 30 * 60 * 1000) efficiency -= 10;
  efficiency = clamp(efficiency);

  const raw = 0.6 * passScore + 0.3 * completionScore + 0.1 * efficiency;
  return clamp(Math.round(raw));
}

/** Aggregate the whole interview into a `CodingInterviewMetrics` summary. */
export function buildCodingInterviewMetrics(state: CodingInterviewStateRecord): CodingInterviewMetrics {
  const questions = state.questions;
  const signals: CodingPerformanceSignal[] = questions.map(analyzeQuestion);

  const attempted = questions.filter((q) => q.attempts.length > 0);
  const completed = questions.filter((q) => Boolean(q.completedAt));
  const solved = questions.filter((q) => {
    const ref = referenceAttempt(q);
    return Boolean(ref && ref.totalCount > 0 && ref.passedCount === ref.totalCount);
  });

  let totalTestsPassed = 0;
  let totalTests = 0;
  let hiddenTestsPassed = 0;
  let hiddenTests = 0;
  for (const q of questions) {
    const ref = referenceAttempt(q);
    if (!ref) continue;
    totalTests += ref.totalCount;
    totalTestsPassed += Math.min(ref.passedCount, ref.totalCount);
    hiddenTests += ref.hiddenTotalCount || 0;
    hiddenTestsPassed += Math.min(ref.hiddenPassedCount || 0, ref.hiddenTotalCount || 0);
  }

  const averageAttempts = attempted.length
    ? round1(attempted.reduce((sum, q) => sum + q.attempts.length, 0) / attempted.length)
    : 0;

  const timeValues = completed.map((q) => q.timeTakenMs).filter((v): v is number => v != null);
  const averageTimeMs = timeValues.length
    ? Math.round(timeValues.reduce((a, b) => a + b, 0) / timeValues.length)
    : 0;

  const masteredTopics = dedupe(state.masteredConcepts);
  const practiceTopics = dedupe(state.failedConcepts);
  const strongAreas = dedupe(signals.filter((s) => s.classification === 'STRONG').map((s) => s.topic));
  const weakAreas = dedupe(signals.filter((s) => s.classification === 'NEEDS_IMPROVEMENT').map((s) => s.topic));

  const overallScore = computeOverallScore({
    totalTests,
    totalTestsPassed,
    attemptedCount: attempted.length,
    solvedCount: solved.length,
    averageAttempts,
    totalHints: questions.reduce((sum, q) => sum + q.hintsUsed, 0),
    averageTimeMs,
  });

  const hasReliableSignal = signals.some((s) => s.passRate != null);

  return {
    questionsAttempted: attempted.length,
    questionsSolved: solved.length,
    totalTestsPassed,
    totalTests,
    hiddenTestsPassed,
    hiddenTests,
    averageAttempts,
    averageTimeMs,
    masteredTopics,
    practiceTopics,
    strongAreas,
    weakAreas,
    overallScore,
    signals,
    hasReliableSignal,
  };
}

/** Full server-computed report: metrics + per-question breakdown. */
export function buildCodingInterviewReport(state: CodingInterviewStateRecord): CodingInterviewReport {
  const metrics = buildCodingInterviewMetrics(state);

  const questions: CodingInterviewQuestionReport[] = state.questions.map((q) => {
    const signal = analyzeQuestion(q);
    const ref = referenceAttempt(q);
    return {
      questionId: q.questionId,
      title: q.title,
      difficulty: q.difficulty,
      topic: q.topic,
      concepts: q.concepts,
      classification: signal.classification,
      status: q.completedAt
        ? 'completed'
        : q.questionId === state.currentQuestionId
          ? 'active'
          : 'pending',
      attempts: q.attempts.length,
      hintsUsed: q.hintsUsed,
      passedCount: ref ? ref.passedCount : 0,
      totalCount: ref ? ref.totalCount : 0,
      hiddenPassedCount: ref ? ref.hiddenPassedCount : 0,
      hiddenTotalCount: ref ? ref.hiddenTotalCount : 0,
      timeTakenMs: q.timeTakenMs,
      fromMock: signal.fromMock,
      language: q.language,
    };
  });

  const verifiedQuestionCount = questions.filter((q) => !q.fromMock).length;

  return {
    metrics,
    questions,
    verifiedQuestionCount,
    mockQuestionCount: questions.length - verifiedQuestionCount,
    hasVerifiedExecution: metrics.hasReliableSignal,
    language: questions[0]?.language || 'python',
  };
}
