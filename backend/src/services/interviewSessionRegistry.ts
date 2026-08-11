/**
 * Phase 6 — Shared in-memory interview state registry.
 *
 * The Socket.IO handler (interviewHandler) and the REST voice route
 * (routes/voice.ts) both drive the SAME interview engine per session.
 * This registry is the single in-memory owner of `InterviewState` objects,
 * so text answers, voice answers, and resume/refresh never create a second
 * engine instance and never duplicate questions.
 */

import { getSessionRecord } from '../routes/sessions';
import { summarizeMatchReport } from './matchEngine';
import {
  createInterviewState,
  type InterviewState,
  type InterviewMode,
} from './interviewEngine';

const interviewStates = new Map<string, InterviewState>();

/**
 * Create (or return) the interview state for a session from the persisted
 * session record. Used by both the Socket.IO handler and the REST voice
 * route so every transport drives the exact same engine state.
 */
export async function createInterviewStateForSession(sessionId: string): Promise<InterviewState> {
  const existing = interviewStates.get(sessionId);
  if (existing) return existing;

  const record = getSessionRecord(sessionId);
  if (!record) throw new Error(`Session not found: ${sessionId}`);

  const state = await createInterviewState({
    sessionId,
    mode: (record?.mode || 'TECHNICAL') as InterviewMode,
    role: record?.role || 'Software Engineer',
    company: record?.company || 'Company',
    resumeText: record?.resumeText || '',
    jdText: record?.jdText || '',
    githubSummary: record?.githubSummary || '',
    projectProfile: record?.projectProfileData ? JSON.stringify(record.projectProfileData) : undefined,
    skills: record?.skills || undefined,
    resumeProfile: record?.resumeProfile || undefined,
    jdProfile: record?.jdProfile || undefined,
    matchSummary: record?.matchReport ? summarizeMatchReport(record.matchReport) : undefined,
    difficulty: (record?.difficulty as InterviewState['difficulty']) || undefined,
  });
  interviewStates.set(sessionId, state);
  return state;
}
/** sessionId -> in-flight promise guard (prevents overlapping turns). */
const inFlight = new Map<string, Promise<unknown>>();

export function getInterviewState(sessionId: string): InterviewState | undefined {
  return interviewStates.get(sessionId);
}

export function setInterviewState(sessionId: string, state: InterviewState): void {
  interviewStates.set(sessionId, state);
}

export function deleteInterviewState(sessionId: string): void {
  interviewStates.delete(sessionId);
}

export function listInterviewStates(): Array<{ sessionId: string; state: InterviewState }> {
  return Array.from(interviewStates.entries()).map(([sessionId, state]) => ({ sessionId, state }));
}

/**
 * Serialize an async turn per session: if a turn is already running for the
 * session the later call is rejected immediately instead of interleaving
 * with the running one.
 */
export function runExclusive<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = inFlight.get(sessionId);
  if (prev) {
    return Promise.reject(new Error('A turn is already in progress for this session.'));
  }
  const next = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inFlight.get(sessionId) === next) inFlight.delete(sessionId);
    });
  inFlight.set(sessionId, next);
  return next;
}
