import { Router, Request, Response } from 'express';
import { getSessionRecord, getOwnedSessionRecord, updateSessionRecord } from './sessions';
import { generateRoadmap } from '../services/roadmap';

const router = Router();

// POST /api/roadmap — generate (or return existing) a personalized learning roadmap
router.post('/', async (req: Request, res: Response) => {
  const { sessionId, role, company, mode } = req.body || {};

  let focusAreas: string[] | undefined;
  let strengths: string[] | undefined;

  let session: Record<string, any> | undefined;
  if (sessionId) {
    session = getOwnedSessionRecord(sessionId, req.user?.userId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    if (Array.isArray(session.roadmap?.steps) && session.roadmap.steps.length > 0) {
      return res.json({ success: true, data: { roadmap: session.roadmap, cached: true } });
    }
    focusAreas = session.analysis?.focusAreas || req.body.focusAreas;
    strengths = session.analysis?.strengths || req.body.strengths;
  }

  try {
    const { roadmap, fromMock } = await generateRoadmap({
      role: session?.role || role || 'Software Engineer',
      company: session?.company || company || 'Unknown',
      mode: session?.mode || mode || 'TECHNICAL',
      focusAreas,
      strengths,
      score: typeof session?.score === 'number' ? session.score : undefined,
      nextTopics: Array.isArray(session?.feedback?.nextTopics)
        ? session.feedback.nextTopics.filter((t: unknown) => typeof t === 'string').slice(0, 6)
        : undefined,
    });

    if (session && session.id) {
      updateSessionRecord(session.id, { roadmap });
    }

    res.json({ success: true, data: { roadmap, fromMock } });
  } catch (err) {
    console.error('[Roadmap] generation failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'Failed to generate roadmap' });
  }
});

// PATCH /api/roadmap/:sessionId/steps/:stepId — toggle a step's completion
// status so the learning timeline stays interactive and durable.
router.patch('/:sessionId/steps/:stepId', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.sessionId, req.user?.userId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  if (!Array.isArray(session.roadmap?.steps)) {
    return res.status(404).json({ success: false, error: 'No roadmap on this session' });
  }

  const { status } = req.body || {};
  const validStatuses = ['in-progress', 'pending', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `status must be one of ${validStatuses.join(', ')}` });
  }

  const step = session.roadmap.steps.find((s: { id?: string }) => s.id === req.params.stepId);
  if (!step) {
    return res.status(404).json({ success: false, error: 'Roadmap step not found' });
  }

  step.status = status;
  updateSessionRecord(req.params.sessionId, { roadmap: session.roadmap });
  res.json({ success: true, data: { roadmap: session.roadmap } });
});

export default router;
