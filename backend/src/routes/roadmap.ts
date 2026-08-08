import { Router, Request, Response } from 'express';
import { getSessionRecord, updateSessionRecord } from './sessions';
import { generateRoadmap } from '../services/roadmap';

const router = Router();

// POST /api/roadmap — generate (or return existing) a personalized learning roadmap
router.post('/', async (req: Request, res: Response) => {
  const { sessionId, role, company, mode } = req.body || {};

  let focusAreas: string[] | undefined;
  let strengths: string[] | undefined;

  let session: Record<string, any> | undefined;
  if (sessionId) {
    session = getSessionRecord(sessionId);
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

export default router;
