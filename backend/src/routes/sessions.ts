import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createSessionStore, SessionStore } from '../services/sessionStore';
import { createJsonStore } from '../services/stores/jsonStore';

const router = Router();

// ──────────────────────────────────────────────────────────────
// Session store — Postgres (Supabase) when DATABASE_URL is set,
// JSON file otherwise. The Map is the in-memory source of truth;
// the store handles durability behind a debounced persist.
// ──────────────────────────────────────────────────────────────

let store: SessionStore = createSessionStore();

const sessions = new Map<string, Record<string, any>>();

export async function initSessionStore(): Promise<SessionStore> {
  try {
    const records = await store.load();
    for (const s of records) sessions.set(s.id, s);
    console.log(
      `[Sessions] Loaded ${records.length} session(s) from ${store.kind === 'postgres' ? 'Postgres (Supabase)' : 'JSON file'}`,
    );
  } catch (err) {
    console.error('[Sessions] Store load failed, falling back to JSON file:', (err as Error).message);
    store = createJsonStore();
    const records = await store.load();
    for (const s of records) sessions.set(s.id, s);
  }
  return store;
}

function createJsonStoreFallback(): SessionStore {
  // Local import keeps the json store out of the critical path at boot.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createJsonStore } = require('../services/stores/jsonStore');
  return createJsonStore();
}

let saveTimer: NodeJS.Timeout | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.persist(Array.from(sessions.values())).catch((err) => {
      console.error('[Sessions] Failed to persist sessions:', (err as Error).message);
    });
  }, 300);
}

/** Flush any pending writes and release store resources (used on shutdown). */
export async function flushSessionStore(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    await store.persist(Array.from(sessions.values()));
  } catch (err) {
    console.error('[Sessions] Failed to flush sessions:', (err as Error).message);
  }
  if (store.close) await store.close();
}

// POST /api/sessions — create a new interview session
router.post('/', (req: Request, res: Response) => {
  const {
    mode = 'CODING',
    role,
    company,
    candidateId,
    resumeText,
    jdText,
    githubSummary,
  } = req.body || {};

  // Input validation / payload caps
  const VALID_MODES = ['CODING', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'PROJECT'];
  const cap = (v: unknown, max: number): string => {
    if (typeof v !== 'string') return '';
    return v.slice(0, max);
  };
  if (mode && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ success: false, error: `mode must be one of ${VALID_MODES.join(', ')}` });
  }
  if (mode === 'CODING' && typeof resumeText === 'string' && resumeText.length > 100000) {
    return res.status(413).json({ success: false, error: 'resumeText is too large' });
  }

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    mode: mode || 'CODING',
    role: cap(role, 200) || 'Software Engineer',
    company: cap(company, 200) || 'Unknown',
    candidateId: cap(candidateId, 100) || 'anonymous',
    resumeText: cap(resumeText, 100000),
    jdText: cap(jdText, 100000),
    githubSummary: cap(githubSummary, 50000),
    status: 'SETUP',
    createdAt: new Date().toISOString(),
    score: null,
    durationMs: null,
    feedback: null,
    roadmap: null,
    transcript: [],
  };

  sessions.set(sessionId, session);
  persist();

  res.status(201).json({ success: true, data: session });
});

// GET /api/sessions/:id — get session details
router.get('/:id', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, data: session });
});

// GET /api/sessions/:id/feedback — return the feedback report (or 404 if none)
router.get('/:id/feedback', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  if (!session.feedback) {
    return res.status(404).json({ success: false, error: 'No feedback yet' });
  }
  res.json({ success: true, data: { id: session.id, ...session.feedback } });
});

// PATCH /api/sessions/:id/status — update session status
router.patch('/:id/status', (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const { status } = req.body;
  const validStatuses = ['SETUP', 'ACTIVE', 'COMPLETED', 'FAILED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value' });
  }

  session.status = status;
  sessions.set(req.params.id, session);
  persist();
  res.json({ success: true, data: session });
});

// GET /api/sessions — list all sessions (newest first)
router.get('/', (_req: Request, res: Response) => {
  const all = Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.json({ success: true, data: all, count: all.length });
});

// ──────────────────────────────────────────────────────────────
// Shared accessors used by the socket handler and other routes
// ──────────────────────────────────────────────────────────────

export function getSessionRecord(id: string): Record<string, any> | undefined {
  return sessions.get(id);
}

export function updateSessionRecord(id: string, patch: Record<string, any>): Record<string, any> | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  Object.assign(session, patch);
  sessions.set(id, session);
  persist();
  return session;
}

export function listSessionRecords(): Record<string, any>[] {
  return Array.from(sessions.values());
}

export default router;
