/**
 * Coding Question Generation — wires the dynamic question engine
 * (services/codingEngine.ts) and its deduplication history
 * (services/questionStore.ts) into the API.
 *
 * GET  /api/coding/history   → recent generated questions (metadata only)
 * POST /api/coding/generate  → fresh question grounded in session context
 */

import { Router, Request, Response } from 'express';
import { getSessionRecord } from './sessions';
import {
  generateCodingQuestion,
  type Difficulty,
} from '../services/codingEngine';
import { getQuestionHistory, addQuestionHistory } from '../services/questionStore';

const router = Router();

const VALID_DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').slice(0, max);
}

// GET /api/coding/history — metadata of every generated question (dedup input)
router.get('/history', (_req: Request, res: Response) => {
  res.json({ success: true, data: getQuestionHistory() });
});

// POST /api/coding/generate — generate (or re-generate) a unique question.
// When sessionId is given, resume skills / JD skills / role are pulled from
// the session; otherwise they can be passed directly in the body.
router.post('/generate', async (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  const language = String(req.body?.language || 'python').toLowerCase();
  const difficulty = (req.body?.difficulty || 'Medium') as Difficulty;
  const topic = typeof req.body?.topic === 'string' && req.body.topic.trim() ? req.body.topic.trim() : undefined;

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ success: false, error: `difficulty must be one of ${VALID_DIFFICULTIES.join(', ')}` });
  }

  let role = 'Software Engineer';
  let resumeSkills: string[] = [];
  let jdSkills: string[] = [];

  if (sessionId) {
    const session = getSessionRecord(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    role = session.role || role;
    resumeSkills = Array.isArray(session.skills) ? session.skills.map(String) : [];
    jdSkills = asStringArray(session.jdProfileData?.requiredSkills, 25);
    if (!jdSkills.length) jdSkills = asStringArray(session.jdProfileData?.preferredSkills, 25);
  } else {
    role = typeof req.body?.role === 'string' && req.body.role.trim() ? req.body.role.trim() : role;
    resumeSkills = asStringArray(req.body?.resumeSkills, 25);
    jdSkills = asStringArray(req.body?.jdSkills, 25);
  }

  try {
    const previous = getQuestionHistory();
    const { question, fromMock, attempts, dupRejected } = await generateCodingQuestion({
      resumeSkills,
      jdSkills,
      role,
      language,
      difficulty,
      topic,
      previous,
    });

    addQuestionHistory({
      question: `${question.title}. ${question.problemStatement}`,
      questionHash: question.questionHash,
      difficulty: question.difficulty,
      topic: question.topic,
      language: question.language,
      source: question.source,
      date: question.date,
      interviewId: sessionId,
    });

    res.json({
      success: true,
      data: {
        question,
        fromMock,
        attempts,
        dupRejected,
        generatedCount: getQuestionHistory().length,
      },
    });
  } catch (err) {
    console.error('[Coding] generation failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'Failed to generate a coding question' });
  }
});

export default router;
