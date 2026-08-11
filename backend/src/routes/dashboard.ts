import { Router, Request, Response } from 'express';
import { listOwnedSessionRecords } from './sessions';
import 'dotenv/config';

const router = Router();

// GET /api/dashboard — real aggregate stats derived from stored sessions
router.get('/', (req: Request, res: Response) => {
  const sessions = listOwnedSessionRecords(req.user?.userId)
    .filter((s) => s.status === 'COMPLETED' || s.status === 'ACTIVE' || s.status === 'SETUP')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completed = sessions.filter((s) => s.status === 'COMPLETED');
  const withScore = completed.filter((s) => typeof s.score === 'number');

  const totalInterviews = sessions.length;
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((sum, s) => sum + s.score, 0) / withScore.length)
    : null;
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMs ? Math.round(s.durationMs / 60000) : 0), 0);

  const byMode: Record<string, number> = {};
  for (const s of sessions) byMode[s.mode] = (byMode[s.mode] || 0) + 1;

  // Most-improved metric: track teaching episodes as a proxy for growth areas
  const focusAreas = new Map<string, number>();
  for (const s of withScore) {
    for (const g of s.feedback?.gaps || []) {
      focusAreas.set(g.topic, (focusAreas.get(g.topic) || 0) + (g.severity === 'HIGH' ? 3 : g.severity === 'MEDIUM' ? 2 : 1));
    }
  }
  const topFocusAreas = Array.from(focusAreas.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  const recentSessions = sessions.slice(0, 5).map((s) => ({
    id: s.id,
    role: s.role,
    company: s.company,
    mode: s.mode,
    date: new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: typeof s.score === 'number' ? s.score : null,
  }));

  const latestRoadmap = sessions.find((s) => Array.isArray(s.roadmap?.steps) && s.roadmap.steps.length > 0)?.roadmap || null;

  res.json({
    success: true,
    data: {
      stats: {
        totalInterviews,
        avgScore,
        totalMinutes,
        byMode,
        topFocusAreas,
      },
      recentSessions,
      roadmap: latestRoadmap,
    },
  });
});

export default router;
