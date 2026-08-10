/**
 * Phase 5 — Deterministic adaptive difficulty + performance classification.
 *
 * Difficulty is ALWAYS decided by verified execution results, never by the
 * LLM. Mock (offline) execution is explicitly excluded from adaptation: the
 * signal is marked UNRELIABLE and the difficulty is left untouched.
 *
 * The thresholds below are configurable constants so tuning requires no code
 * changes beyond this file.
 */

import type {
  CodingAttempt,
  CodingDifficulty,
  CodingPerformanceClassification,
  CodingPerformanceSignal,
  CodingQuestionRecord,
} from './codingTypes';

export const DIFFICULTY_ORDER: CodingDifficulty[] = ['Easy', 'Medium', 'Hard'];

export const DIFFICULTY_CONFIG = {
  /** passRate >= this -> STRONG (performance is strong). */
  strongPassRate: 0.85,
  /** passRate >= this (and below strong) -> STABLE. */
  stablePassRate: 0.6,
  /** After this many consecutive strong questions, nudge up even from STABLE. */
  consecutiveSuccessesBoost: 2,
  /** After this many consecutive failing questions, nudge down even from STABLE. */
  consecutiveFailuresDrop: 2,
  /** Never move more than one level per question. */
  maxLevelJump: 1,
  /** Secondary signals (never dominant): attempt count + hint usage penalties. */
  extraAttemptPenalty: 0.04,
  hintPenalty: 0.03,
  /** Long-question threshold (ms) — qualitative only, never drives difficulty. */
  longQuestionMs: 40 * 60 * 1000,
};

export function difficultyIndex(d: CodingDifficulty): number {
  return DIFFICULTY_ORDER.indexOf(d);
}

export function clampLevel(v: number): number {
  return Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, v));
}

export type DifficultyDirection = 'up' | 'down' | 'same' | 'none';

export interface DifficultyDecision {
  difficulty: CodingDifficulty;
  direction: DifficultyDirection;
  reason: string;
}

/**
 * Classify a single pass rate band. The bands are fixed configurable
 * constants; a mock/unverified result must never reach this function.
 */
export function classifyPassRate(passRate: number): CodingPerformanceClassification {
  if (passRate >= DIFFICULTY_CONFIG.strongPassRate) return 'STRONG';
  if (passRate >= DIFFICULTY_CONFIG.stablePassRate) return 'STABLE';
  return 'NEEDS_IMPROVEMENT';
}

/** The most informative reliable attempt of a question (last non-mock). */
export function pickReliableAttempt(attempts: CodingAttempt[]): CodingAttempt | null {
  if (!attempts.length) return null;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (!attempts[i].fromMock) return attempts[i];
  }
  return null;
}

/**
 * Deterministic per-question performance signal.
 *
 * - No attempts or only mock attempts -> UNRELIABLE (passRate = null).
 * - Otherwise the pass rate comes from the last verified (non-mock) attempt.
 * - Secondary signals (extra attempts, hint usage) only nudge the final
 *   classification, never the pass rate itself.
 * - `fromMock` is true whenever there is no verified test evidence (unattempted
 *   questions included), so it can never count toward `verifiedQuestionCount`.
 */
export function analyzeQuestion(record: CodingQuestionRecord): CodingPerformanceSignal {
  const reliable = pickReliableAttempt(record.attempts);
  const hasReliable = !!reliable && reliable.totalCount > 0;
  const fromMock = !hasReliable;

  let passRate: number | null = null;
  let visiblePassRate: number | null = null;
  let hiddenPassRate: number | null = null;
  let classification: CodingPerformanceClassification = 'UNRELIABLE';

  if (hasReliable && reliable) {
    passRate = reliable.passedCount / reliable.totalCount;
    visiblePassRate = reliable.visibleTotalCount > 0 ? reliable.visiblePassedCount / reliable.visibleTotalCount : null;
    hiddenPassRate = reliable.hiddenTotalCount > 0 ? reliable.hiddenPassedCount / reliable.hiddenTotalCount : null;

    let classificationBand = classifyPassRate(passRate);
    if (classificationBand === 'STRONG') {
      // A hidden-test miss keeps the result honest: many passes on visible
      // tests but failing hidden ones is not "strong".
      if (hiddenPassRate != null && hiddenPassRate < DIFFICULTY_CONFIG.stablePassRate) {
        classificationBand = 'STABLE';
      }
    }

    // Secondary signals (bounded, never dominant).
    let nudge = 0;
    if (record.attempts.length > 1) nudge -= DIFFICULTY_CONFIG.extraAttemptPenalty * (record.attempts.length - 1);
    if (record.hintsUsed > 0) nudge -= DIFFICULTY_CONFIG.hintPenalty * record.hintsUsed;

    if (nudge <= -0.08) {
      classification = classificationBand === 'STRONG' ? 'STABLE' : 'NEEDS_IMPROVEMENT';
    } else {
      classification = classificationBand;
    }
  }

  return {
    questionId: record.questionId,
    topic: record.topic,
    difficulty: record.difficulty,
    concepts: record.concepts,
    passRate,
    visiblePassRate,
    hiddenPassRate,
    attempts: record.attempts.length,
    finalStatus: record.finalResult ? record.finalResult.status : null,
    timeTakenMs: record.timeTakenMs,
    hintsUsed: record.hintsUsed,
    fromMock,
    classification,
  };
}

export interface AdaptiveContext {
  /** Consecutive STRONG questions so far (before this question). */
  consecutiveSuccesses: number;
  /** Consecutive NEEDS_IMPROVEMENT questions so far (before this question). */
  consecutiveFailures: number;
}

/**
 * Deterministic next-difficulty decision.
 *
 * Rules (max one level jump):
 *   STRONG            -> one level up
 *   STABLE            -> stay (nudged up after N consecutive strong, down
 *                        after N consecutive failures)
 *   NEEDS_IMPROVEMENT -> one level down
 *   UNRELIABLE (mock) -> unchanged
 */
export function decideNextDifficulty(
  current: CodingDifficulty,
  signal: CodingPerformanceSignal,
  context: AdaptiveContext,
  config: typeof DIFFICULTY_CONFIG = DIFFICULTY_CONFIG,
): DifficultyDecision {
  const curIdx = difficultyIndex(current);
  const levelAt = (idx: number): DifficultyDecision => {
    const clamped = clampLevel(idx);
    const diff = DIFFICULTY_ORDER[clamped];
    const direction: DifficultyDirection = clamped > curIdx ? 'up' : clamped < curIdx ? 'down' : 'same';
    return { difficulty: diff, direction, reason: '' };
  };

  if (signal.classification === 'UNRELIABLE' || signal.passRate == null) {
    return { difficulty: current, direction: 'none', reason: 'unreliable performance signal (mock execution) — difficulty unchanged' };
  }

  if (signal.classification === 'STRONG') {
    return { ...levelAt(curIdx + config.maxLevelJump), reason: 'strong performance on the previous question' };
  }

  if (signal.classification === 'NEEDS_IMPROVEMENT') {
    return { ...levelAt(curIdx - config.maxLevelJump), reason: 'previous question needs improvement' };
  }

  // STABLE
  if (context.consecutiveSuccesses >= config.consecutiveSuccessesBoost && curIdx < DIFFICULTY_ORDER.length - 1) {
    return { ...levelAt(curIdx + 1), reason: 'consistent strong performance across consecutive questions' };
  }
  if (context.consecutiveFailures >= config.consecutiveFailuresDrop && curIdx > 0) {
    return { ...levelAt(curIdx - 1), reason: 'repeated difficulty — pacing down for momentum' };
  }
  return { difficulty: current, direction: 'same', reason: 'performance stable — difficulty maintained' };
}

/** Human-safe one-liner shown to the candidate (no internal scoring details). */
export function difficultyToMessage(decision: DifficultyDecision): string {
  switch (decision.direction) {
    case 'up': return `Difficulty: ${decision.difficulty}`;
    case 'down': return `Difficulty: ${decision.difficulty}`;
    case 'same': return `Difficulty: ${decision.difficulty}`;
    default: return `Difficulty: ${decision.difficulty}`;
  }
}
