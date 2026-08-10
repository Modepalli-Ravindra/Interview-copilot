import { Router, Request, Response } from 'express';
import { listSessionRecords } from './sessions';

const router = Router();

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
  /** Oldest → newest scores (for sparklines), nulls kept so gaps show. */
  scoreTrend: Array<{ createdAt: string; score: number | null }>;
}

function summarize(candidateId: string, sessions: Record<string, any>[]): CandidateSummary {
  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const completed = sessions.filter((s) => s.status === 'COMPLETED');
  const withScore = completed.filter((s) => typeof s.score === 'number');
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((sum, s) => sum + s.score, 0) / withScore.length)
    : null;

  const name = sessions.find((s) => s.candidateName)?.candidateName || '';
  const email =
    sessions.find((s) => s.candidateEmail)?.candidateEmail ||
    (candidateId !== 'anonymous' && candidateId.includes('@') ? candidateId : '');

  const modes: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const s of sessions) {
    modes[s.mode] = (modes[s.mode] || 0) + 1;
    statuses[s.status] = (statuses[s.status] || 0) + 1;
  }

  const trend = [...sessions].reverse().slice(-10).map((s) => ({
    createdAt: s.createdAt,
    score: typeof s.score === 'number' ? s.score : null,
  }));

  return {
    id: candidateId,
    name,
    email,
    sessionCount: sessions.length,
    completedCount: completed.length,
    avgScore,
    lastActive: sessions[0]?.createdAt || null,
    latestStatus: sessions[0]?.status || null,
    latestMode: sessions[0]?.mode || null,
    modes,
    statuses,
    scoreTrend: trend,
  };
}

// GET /api/candidates — aggregate sessions into per-candidate pipeline cards
router.get('/', (_req: Request, res: Response) => {
  const sessions = listSessionRecords();
  const byCandidate = new Map<string, Record<string, any>[]>();
  for (const s of sessions) {
    const key = s.candidateId || 'anonymous';
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key)!.push(s);
  }

  const candidates = Array.from(byCandidate.entries())
    .map(([id, list]) => summarize(id, list))
    .sort(
      (a, b) =>
        new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime(),
    );

  res.json({ success: true, data: candidates, count: candidates.length });
});

// GET /api/candidates/:id — every session for one candidate (newest first)
router.get('/:id', (req: Request, res: Response) => {
  const sessions = listSessionRecords()
    .filter((s) => (s.candidateId || 'anonymous') === req.params.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (sessions.length === 0) {
    return res.status(404).json({ success: false, error: 'Candidate not found' });
  }

  res.json({
    success: true,
    data: {
      id: req.params.id,
      summary: summarize(req.params.id, sessions),
      sessions,
    },
  });
});

export default router;
