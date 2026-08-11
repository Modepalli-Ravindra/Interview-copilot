import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createSessionStore, SessionStore } from '../services/sessionStore';
import { createJsonStore } from '../services/stores/jsonStore';
import { parseResumeText, summarizeResumeProfile, sanitizeResumeProfile, type ResumeProfile } from '../services/resumeParser';
import { parseJdText, summarizeJdProfile, sanitizeJdProfile, type JdProfile } from '../services/jdParser';
import { matchResumeToJd, type MatchResult } from '../services/matchEngine';
import { summarizeProjectProfile, type ProjectProfile } from '../services/repoAnalyzer';
import { createDefaultVoiceMeta, type VoiceSessionMeta } from '../services/voiceTypes';

const router = Router();

function isResumeProfile(v: unknown): v is ResumeProfile {
  return !!v && typeof v === 'object' && typeof (v as ResumeProfile).personal === 'object';
}

function isJdProfile(v: unknown): v is JdProfile {
  return !!v && typeof v === 'object' && typeof (v as JdProfile).role === 'string';
}

function isMatchReport(v: unknown): v is MatchResult {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as MatchResult).overallMatch === 'number' &&
    Array.isArray((v as MatchResult).matchedSkills) &&
    Array.isArray((v as MatchResult).missingSkills)
  );
}

function isProjectProfile(v: unknown): v is ProjectProfile {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as ProjectProfile).fullName === 'string' &&
    typeof (v as ProjectProfile).repoUrl === 'string' &&
    !!v &&
    typeof (v as ProjectProfile).technologyProfile === 'object'
  );
}

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
router.post('/', async (req: Request, res: Response) => {
  const {
    mode = 'CODING',
    role,
    company,
    candidateId,
    resumeText,
    jdText,
    githubSummary,
    difficulty,
    skills: clientSkills,
    resumeProfile: clientResumeProfile,
    jdProfile: clientJdProfile,
    resumeProfileData: clientResumeProfileData,
    jdProfileData: clientJdProfileData,
    matchReport: clientMatchReport,
    resumeFileKey,
    resumeFileUrl,
    resumeFileName,
    projectProfileData: clientProjectProfileData,
    voiceMode,
    voiceEnabled,
    sttSupported,
    ttsSupported,
  } = req.body || {};

  // Input validation / payload caps
  const VALID_MODES = [
    'CODING', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'PROJECT',
    'HR', 'MIXED', 'RESUME_BASED', 'JD_BASED', 'SKILLS_BASED',
    'CODING_INTERVIEW',
  ];
  const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
  const cap = (v: unknown, max: number): string => {
    if (typeof v !== 'string') return '';
    return v.slice(0, max);
  };
  const capArray = (v: unknown, maxItems: number, maxLen: number): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === 'string')
      .slice(0, maxItems)
      .map((x) => x.slice(0, maxLen));
  };
  if (mode && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ success: false, error: `mode must be one of ${VALID_MODES.join(', ')}` });
  }
  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ success: false, error: `difficulty must be one of ${VALID_DIFFICULTIES.join(', ')}` });
  }
  if (voiceMode !== undefined && !['voice', 'text'].includes(voiceMode)) {
    return res.status(400).json({ success: false, error: 'voiceMode must be "voice" or "text"' });
  }
  if (voiceEnabled !== undefined && typeof voiceEnabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'voiceEnabled must be a boolean' });
  }
  if (mode === 'CODING' && typeof resumeText === 'string' && resumeText.length > 100000) {
    return res.status(413).json({ success: false, error: 'resumeText is too large' });
  }

  const sessionId = randomUUID();

  // Deterministic profile extraction — canonical skills + structured summaries
  // used by the interview engine to ground questions in the actual content.
  let skills: string[] = [];
  let resumeProfile = '';
  let jdProfile = '';
  let resumeProfileData: ResumeProfile | null = null;
  let jdProfileData: JdProfile | null = null;
  let matchReport: MatchResult | null = null;
  try {
    if (resumeText && typeof resumeText === 'string' && resumeText.trim()) {
      const rp = parseResumeText(resumeText, 'Resume');
      skills = rp.skills.slice(0, 20);
      resumeProfile = summarizeResumeProfile(rp);
      if (!isResumeProfile(clientResumeProfileData)) resumeProfileData = rp;
    }
    if (jdText && typeof jdText === 'string' && jdText.trim()) {
      const jd = await parseJdText(jdText, typeof company === 'string' ? company : 'Unknown');
      jdProfile = summarizeJdProfile(jd);
      if (!isJdProfile(clientJdProfileData)) jdProfileData = jd;
    }
  } catch (err) {
    console.warn('[Sessions] profile extraction failed:', (err as Error).message);
  }
  // Allow clients to override the deterministic extraction with richer input.
  if (Array.isArray(clientSkills) && clientSkills.length) skills = capArray(clientSkills, 20, 100);
  if (typeof clientResumeProfile === 'string' && clientResumeProfile.trim()) resumeProfile = cap(clientResumeProfile, 4000);
  if (typeof clientJdProfile === 'string' && clientJdProfile.trim()) jdProfile = cap(clientJdProfile, 4000);
  if (isResumeProfile(clientResumeProfileData)) {
    resumeProfileData = clientResumeProfileData;
    resumeProfile = cap(summarizeResumeProfile(clientResumeProfileData), 4000);
  }
  if (isJdProfile(clientJdProfileData)) {
    jdProfileData = clientJdProfileData;
    jdProfile = cap(summarizeJdProfile(clientJdProfileData), 4000);
  }

  // Deterministic resume<->JD match — computed server-side whenever both
  // structured profiles are available (clients may pass a richer report).
  if (isMatchReport(clientMatchReport)) {
    matchReport = clientMatchReport;
  } else if (resumeProfileData && jdProfileData) {
    try {
      matchReport = matchResumeToJd(resumeProfileData, jdProfileData);
    } catch (err) {
      console.warn('[Sessions] match computation failed:', (err as Error).message);
    }
  }

  // Structured GitHub project profile (Phase 4) — when present the interview
  // engine automatically receives a rich githubSummary derived from it.
  let projectProfileData: ProjectProfile | null = null;
  let projectIndex: unknown[] | null = null;
  let githubAnalysis = '';
  let githubAnalyzedAt: string | null = null;
  let effectiveGithubSummary = typeof githubSummary === 'string' ? githubSummary : '';
  if (isProjectProfile(clientProjectProfileData)) {
    projectProfileData = clientProjectProfileData;
    githubAnalysis = summarizeProjectProfile({
      fullName: clientProjectProfileData.fullName,
      description: clientProjectProfileData.description,
      primaryLanguage: clientProjectProfileData.primaryLanguage,
      languages: clientProjectProfileData.languages,
      tech: clientProjectProfileData.technologyProfile,
      arch: clientProjectProfileData.architecture,
      readme: clientProjectProfileData.readme,
    });
    if (Array.isArray(clientProjectProfileData.projectIndex)) projectIndex = clientProjectProfileData.projectIndex;
    githubAnalyzedAt = clientProjectProfileData.analyzedAt || new Date().toISOString();
    effectiveGithubSummary = githubAnalysis;
  }

  // Candidate identity — clients may pass an explicit candidateId; otherwise
  // derive it from the resume email so interviews by the same person group
  // together for the candidates/pipeline view.
  const candidateEmail = cap(resumeProfileData?.personal?.email, 200);
  const candidateName = cap(resumeProfileData?.personal?.name, 200);
  const requestedCandidateId = cap(candidateId, 100);
  const finalCandidateId =
    requestedCandidateId && requestedCandidateId !== 'anonymous'
      ? requestedCandidateId
      : (candidateEmail ? candidateEmail.toLowerCase() : 'anonymous');

  // Phase 6 — voice interview configuration (persisted, additive).
  const voice: VoiceSessionMeta = createDefaultVoiceMeta();
  if (voiceMode === 'voice' || voiceMode === 'text') voice.mode = voiceMode;
  if (typeof voiceEnabled === 'boolean') voice.enabled = voiceEnabled;
  if (typeof sttSupported === 'boolean') voice.sttSupported = sttSupported;
  if (typeof ttsSupported === 'boolean') voice.ttsSupported = ttsSupported;
  if (voice.enabled) voice.startedAt = new Date().toISOString();

  const session = {
    id: sessionId,
    userId: req.user?.userId ?? null,
    mode: mode || 'CODING',
    difficulty: difficulty || 'Medium',
    role: cap(role, 200) || 'Software Engineer',
    company: cap(company, 200) || 'Unknown',
    candidateId: finalCandidateId,
    candidateName,
    candidateEmail,
    resumeText: cap(resumeText, 100000),
    jdText: cap(jdText, 100000),
    githubSummary: cap(effectiveGithubSummary, 50000),
    skills: capArray(skills, 20, 100),
    resumeProfile: cap(resumeProfile, 4000),
    jdProfile: cap(jdProfile, 4000),
    resumeProfileData: resumeProfileData ? sanitizeResumeProfile(resumeProfileData) : null,
    jdProfileData: jdProfileData ? sanitizeJdProfile(jdProfileData) : null,
    matchReport,
    resumeFileKey: cap(resumeFileKey, 500) || null,
    resumeFileUrl: cap(resumeFileUrl, 500) || null,
    resumeFileName: cap(resumeFileName, 200) || null,
    projectProfileData,
    projectIndex,
    githubAnalysis,
    githubAnalyzedAt,
    status: 'SETUP',
    createdAt: new Date().toISOString(),
    score: null,
    durationMs: null,
    feedback: null,
    roadmap: null,
    transcript: [],
    voice,
  };

  sessions.set(sessionId, session);
  persist();

  res.status(201).json({ success: true, data: session });
});

// GET /api/sessions/:id — get session details
router.get('/:id', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, data: session });
});

// GET /api/sessions/:id/feedback — return the feedback report (or 404 if none)
router.get('/:id/feedback', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
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
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
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
router.get('/', (req: Request, res: Response) => {
  const all = listOwnedSessionRecords(req.user?.userId).sort(
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

/**
 * Legacy sessions (no userId) remain visible to any authenticated user for
 * backwards compatibility; owned sessions are restricted to their owner.
 */
export function isOwnedSession(record: Record<string, any> | undefined, userId: unknown): boolean {
  if (!record) return false;
  if (!record.userId) return true;
  return !!userId && record.userId === userId;
}

export function getOwnedSessionRecord(id: string, userId: unknown): Record<string, any> | undefined {
  const rec = sessions.get(id);
  if (!rec || !isOwnedSession(rec, userId)) return undefined;
  return rec;
}

export function listOwnedSessionRecords(userId: unknown): Record<string, any>[] {
  return Array.from(sessions.values()).filter((s) => isOwnedSession(s, userId));
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
