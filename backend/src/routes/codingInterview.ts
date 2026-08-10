/**
 * Phase 5 — Adaptive Coding Interview (mode: CODING_INTERVIEW).
 *
 * A question-by-question flow grounded in the candidate's resume, JD,
 * project/GitHub analysis and match report. Difficulty adapts deterministically
 * from verified execution results (never from the LLM). Hidden test payloads
 * never leave the server — clients receive a public projection only.
 *
 * POST   /api/coding-interview/start
 * GET    /api/coding-interview/status/:sessionId
 * POST   /api/coding-interview/:sessionId/questions/:questionId/hint
 * POST   /api/coding-interview/:sessionId/questions/:questionId/submit
 * POST   /api/coding-interview/:sessionId/complete
 * POST   /api/coding-interview/:sessionId/next        (force=true skips active)
 * POST   /api/coding-interview/:sessionId/cancel
 */

import { Router, Request, Response } from 'express';
import { getSessionRecord } from './sessions';
import { generateCodingQuestion, type GenerateQuestionInput } from '../services/codingEngine';
import { getQuestionHistory, addQuestionHistory } from '../services/questionStore';
import { summarizeMatchReport } from '../services/matchEngine';
import { summarizeProjectProfile } from '../services/repoAnalyzer';
import { buildHint, HINTS_PER_QUESTION } from '../services/codingHints';
import { difficultyToMessage } from '../services/codingAdaptive';
import { buildCodingInterviewReport } from '../services/codingMetrics';
import { generateFeedback } from '../services/feedback';
import { updateSessionRecord } from './sessions';
import {
  activateQuestion,
  appendAttempt,
  buildQuestionRecord,
  completeQuestion,
  findQuestion,
  getActiveQuestion,
  getOrCreateCodingInterviewState,
  loadCodingInterviewState,
  saveCodingInterviewState,
  toPublicQuestion,
  toPublicStatus,
  type CodingInterviewStateRecord,
} from '../services/codingStateManager';
import type { CodingDifficulty } from '../services/codingTypes';

const router = Router();

const VALID_DIFFICULTIES: CodingDifficulty[] = ['Easy', 'Medium', 'Hard'];

function requireState(req: Request, res: Response): CodingInterviewStateRecord | null {
  const state = loadCodingInterviewState(req.params.sessionId);
  if (!state) {
    res.status(404).json({ success: false, error: 'No coding interview found for this session' });
    return null;
  }
  return state;
}

function requireQuestion(state: CodingInterviewStateRecord, req: Request, res: Response) {
  const question = findQuestion(state, req.params.questionId);
  if (!question) {
    res.status(404).json({ success: false, error: 'Question not found in this interview' });
    return null;
  }
  return question;
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function toNullableInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function resolveLanguage(session: Record<string, any>, bodyLanguage?: unknown): string {
  const fromBody = typeof bodyLanguage === 'string' && bodyLanguage.trim() ? bodyLanguage.trim() : '';
  const fromSession = typeof session.coding?.language === 'string' ? session.coding.language : '';
  const lang = (fromBody || fromSession || 'python').toLowerCase();
  return ['python', 'javascript', 'go', 'java', 'cpp'].includes(lang) ? lang : 'python';
}

/** Build a compact generation context from the stored session analysis. */
function buildGenerationInput(
  session: Record<string, any>,
  state: CodingInterviewStateRecord,
  language: string,
): GenerateQuestionInput {
  const jdData = session.jdProfileData as Record<string, any> | undefined;
  const requiredSkills = Array.isArray(jdData?.requiredSkills) ? jdData.requiredSkills.map(String) : [];
  const preferredSkills = Array.isArray(jdData?.preferredSkills) ? jdData.preferredSkills.map(String) : [];
  const responsibilities = Array.isArray(jdData?.responsibilities) ? jdData.responsibilities.map(String) : [];
  const jdSkills = requiredSkills.length ? requiredSkills : preferredSkills;

  let projectProfile: string | undefined;
  const pp = session.projectProfileData as Record<string, any> | undefined;
  if (pp && typeof pp === 'object' && typeof pp.fullName === 'string') {
    try {
      projectProfile = summarizeProjectProfile(pp as Parameters<typeof summarizeProjectProfile>[0]);
    } catch {
      projectProfile = undefined;
    }
  }

  let matchSummary: string | undefined;
  if (session.matchReport && typeof session.matchReport === 'object') {
    try {
      matchSummary = summarizeMatchReport(session.matchReport);
    } catch {
      matchSummary = undefined;
    }
  }

  return {
    resumeSkills: Array.isArray(session.skills) ? session.skills.map(String).slice(0, 25) : [],
    jdSkills: jdSkills.slice(0, 25),
    role: typeof session.role === 'string' ? session.role : 'Software Engineer',
    language,
    difficulty: state.currentDifficulty,
    previous: getQuestionHistory(),
    resumeProfile: typeof session.resumeProfile === 'string' && session.resumeProfile.trim() ? session.resumeProfile : undefined,
    jdProfile: typeof session.jdProfile === 'string' && session.jdProfile.trim() ? session.jdProfile : undefined,
    matchSummary,
    projectProfile,
    githubSummary: typeof session.githubSummary === 'string' && session.githubSummary.trim() ? session.githubSummary : undefined,
    failedConcepts: state.failedConcepts,
    masteredConcepts: state.masteredConcepts,
    jdRequiredSkills: requiredSkills.slice(0, 15),
    jdPreferredSkills: preferredSkills.slice(0, 15),
    jdResponsibilities: responsibilities.slice(0, 6),
  };
}

/** Generate + activate the next question for the session. */
async function askNextQuestion(
  session: Record<string, any>,
  state: CodingInterviewStateRecord,
  language: string,
): Promise<{ fromMock: boolean }> {
  const input = buildGenerationInput(session, state, language);
  const { question, fromMock } = await generateCodingQuestion(input);
  const record = buildQuestionRecord(question);
  activateQuestion(state, record);
  addQuestionHistory({
    question: `${question.title}. ${question.problemStatement}`,
    questionHash: question.questionHash,
    difficulty: question.difficulty,
    topic: question.topic,
    language: question.language,
    source: question.source,
    date: question.date,
    interviewId: state.sessionId,
    concepts: question.concepts,
  });
  return { fromMock };
}

// POST /start — create (or resume) a coding interview and ask Q1
router.post('/start', async (req: Request, res: Response) => {
  const { sessionId, questionCount } = req.body || {};
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }
  const session = getSessionRecord(sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const startDifficulty = (req.body?.startDifficulty as CodingDifficulty) || undefined;
  if (startDifficulty && !VALID_DIFFICULTIES.includes(startDifficulty)) {
    return res.status(400).json({ success: false, error: `difficulty must be one of ${VALID_DIFFICULTIES.join(', ')}` });
  }

  const state = getOrCreateCodingInterviewState(sessionId, questionCount, startDifficulty);
  if (state.completed) {
    return res.json({ success: true, data: { status: toPublicStatus(state), question: null, finished: true } });
  }

  const active = getActiveQuestion(state);
  if (active) {
    return res.json({ success: true, data: { status: toPublicStatus(state), question: toPublicQuestion(active), finished: false, resumed: true } });
  }

  try {
    const language = resolveLanguage(session, req.body?.language);
    await askNextQuestion(session, state, language);
    res.json({ success: true, data: { status: toPublicStatus(state), question: toPublicQuestion(findQuestion(state, state.currentQuestionId!)!), finished: false } });
  } catch (err) {
    console.error('[CodingInterview] failed to start interview:', (err as Error).message);
    res.status(502).json({ success: false, error: 'Failed to start the coding interview' });
  }
});

// GET /status/:sessionId — resume-safe status + active question
router.get('/status/:sessionId', (req: Request, res: Response) => {
  const state = loadCodingInterviewState(req.params.sessionId);
  if (!state) {
    return res.json({ success: true, data: { status: null, question: null, active: false } });
  }
  const active = getActiveQuestion(state);
  res.json({
    success: true,
    data: { status: toPublicStatus(state), question: active ? toPublicQuestion(active) : null, active: Boolean(active) },
  });
});

// POST /:sessionId/questions/:questionId/hint — deterministic next hint
router.post('/:sessionId/questions/:questionId/hint', (req: Request, res: Response) => {
  const state = requireState(req, res);
  if (!state) return;
  const question = requireQuestion(state, req, res);
  if (!question) return;
  if (question.completedAt) {
    return res.status(409).json({ success: false, error: 'Question already completed' });
  }
  const requestedSlot = Number(req.body?.slot);
  const slot: 1 | 2 = requestedSlot === 1 || requestedSlot === 2 ? (requestedSlot as 1 | 2) : (Math.min(question.hintsUsed + 1, 2) as 1 | 2);
  if (question.hintsUsed >= HINTS_PER_QUESTION) {
    return res.status(400).json({ success: false, error: 'No hints remaining for this question', data: { hintsUsed: question.hintsUsed, hintsAvailable: HINTS_PER_QUESTION } });
  }
  question.hintsUsed += 1;
  const hint = buildHint({ topic: question.topic, concepts: question.concepts, difficulty: question.difficulty }, slot);
  saveCodingInterviewState(state);
  res.json({ success: true, data: { hint, hintsUsed: question.hintsUsed, hintsAvailable: HINTS_PER_QUESTION } });
});

// POST /:sessionId/questions/:questionId/submit — record a verified attempt
router.post('/:sessionId/questions/:questionId/submit', (req: Request, res: Response) => {
  const state = requireState(req, res);
  if (!state) return;
  const question = requireQuestion(state, req, res);
  if (!question) return;
  if (question.completedAt) {
    return res.status(409).json({ success: false, error: 'Question already completed' });
  }

  const b = req.body || {};
  const attempt = appendAttempt(state, question.questionId, {
    submittedCode: String(b.sourceCode ?? b.source_code ?? '').slice(0, 12000),
    language: String(b.language || question.language || 'python').toLowerCase().slice(0, 20),
    status: String(b.status || 'ACCEPTED').slice(0, 30),
    passedCount: toInt(b.passedCount ?? b.passed_count),
    totalCount: toInt(b.totalCount ?? b.total_count),
    visiblePassedCount: toInt(b.visiblePassedCount ?? b.visible_passed_count ?? b.passedCount ?? 0),
    visibleTotalCount: toInt(b.visibleTotalCount ?? b.visible_total_count ?? b.totalCount ?? 0),
    hiddenPassedCount: toInt(b.hiddenPassedCount ?? b.hidden_passed_count ?? 0),
    hiddenTotalCount: toInt(b.hiddenTotalCount ?? b.hidden_total_count ?? 0),
    executionTimeMs: toNullableInt(b.timeMs ?? b.time_ms ?? b.executionTimeMs),
    memoryKb: toNullableInt(b.memoryKb ?? b.memory_kb),
    stderr: typeof b.stderr === 'string' ? b.stderr.slice(0, 4000) : null,
    fromMock: Boolean(b.fromMock),
  });
  if (!attempt) return res.status(404).json({ success: false, error: 'Question not found' });

  res.json({ success: true, data: { attempt, status: toPublicStatus(state) } });
});

// POST /:sessionId/complete — finalize the active question, adapt difficulty
router.post('/:sessionId/complete', (req: Request, res: Response) => {
  const state = requireState(req, res);
  if (!state) return;
  const result = completeQuestion(state);
  if (!result) {
    return res.status(409).json({ success: false, error: 'No active question to complete' });
  }
  res.json({
    success: true,
    data: {
      status: toPublicStatus(result.state),
      message: difficultyToMessage(result.decision),
      decision: { difficulty: result.decision.difficulty, direction: result.decision.direction, reason: result.decision.reason },
      signal: { classification: result.signal.classification, passRate: result.signal.passRate },
      finished: result.completed,
    },
  });
});

// POST /:sessionId/next — ask the next adaptive question (force=true skips the active one)
router.post('/:sessionId/next', async (req: Request, res: Response) => {
  const session = getSessionRecord(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  let state = requireState(req, res);
  if (!state) return;

  if (state.completed) {
    return res.status(409).json({ success: false, error: 'Coding interview already completed', data: { status: toPublicStatus(state), question: null, finished: true } });
  }

  const active = getActiveQuestion(state);
  if (active && !req.body?.force) {
    return res.status(409).json({
      success: false,
      error: 'Finish or force-skip the active question first',
      data: { status: toPublicStatus(state), question: toPublicQuestion(active) },
    });
  }
  if (active) {
    completeQuestion(state);
    state = loadCodingInterviewState(req.params.sessionId);
    if (!state) return res.status(500).json({ success: false, error: 'State lost after completion' });
    if (state.completed) {
      return res.json({ success: true, data: { status: toPublicStatus(state), question: null, finished: true } });
    }
  }

  try {
    const language = resolveLanguage(session, req.body?.language);
    await askNextQuestion(session, state, language);
    res.json({
      success: true,
      data: { status: toPublicStatus(state), question: toPublicQuestion(findQuestion(state, state.currentQuestionId!)!), finished: false },
    });
  } catch (err) {
    console.error('[CodingInterview] failed to generate next question:', (err as Error).message);
    res.status(502).json({ success: false, error: 'Failed to generate the next coding question' });
  }
});

// POST /:sessionId/cancel — end the interview early (status remains readable)
router.post('/:sessionId/cancel', (req: Request, res: Response) => {
  const state = requireState(req, res);
  if (!state) return;
  state.completed = true;
  state.currentQuestionId = null;
  saveCodingInterviewState(state);
  res.json({ success: true, data: { status: toPublicStatus(state) } });
});

// POST /:sessionId/feedback — generate + persist the end-of-interview report.
//
// Auto-completes the active question, builds the deterministic metrics report
// from the stored execution truth, generates the AI feedback report, and
// persists it on the session (status COMPLETED, score, feedback) so it shows
// up in the interviews list like any other finalized session.
router.post('/:sessionId/feedback', async (req: Request, res: Response) => {
  const state = requireState(req, res);
  if (!state) return;

  if (getActiveQuestion(state)) {
    completeQuestion(state);
  }
  state.completed = true;
  state.currentQuestionId = null;
  saveCodingInterviewState(state);

  const session = getSessionRecord(state.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  try {
    const codingInterview = buildCodingInterviewReport(state);
    const { report } = await generateFeedback({
      role: session.role || 'Software Engineer',
      company: session.company || 'Unknown',
      mode: 'CODING_INTERVIEW',
      difficulty: session.difficulty || 'Medium',
      transcript: Array.isArray(session.transcript) ? session.transcript : [],
      analysis: null,
      resumeProfile: session.resumeProfile ?? null,
      jdProfile: session.jdProfile ?? null,
      skills: session.skills ?? null,
      matchSummary: session.matchReport && typeof session.matchReport === 'object'
        ? summarizeMatchReport(session.matchReport)
        : null,
      githubAnalysis: session.githubSummary ?? null,
      coding: session.coding ?? null,
      codingInterview,
    });

    updateSessionRecord(state.sessionId, {
      status: 'COMPLETED',
      score: report.score,
      feedback: report,
      durationMs: session.durationMs ?? 0,
    });

    res.json({
      success: true,
      data: {
        report,
        codingInterview,
        finished: true,
        fromMock: report.feedbackSource === 'mock',
      },
    });
  } catch (err) {
    console.error('[CodingInterview] feedback generation failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'Failed to generate the coding interview feedback' });
  }
});

export default router;
