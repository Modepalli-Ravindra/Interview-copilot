/**
 * Phase 6 — Shared interview finalizer.
 *
 * Extracted from the Socket.IO handler so both the socket flow and the REST
 * voice route finalize an interview identically: generate feedback +
 * roadmap, persist score/feedback/roadmap/status on the session, and return
 * the result so callers can emit their transport-specific events.
 */

import { getSessionRecord, updateSessionRecord } from '../routes/sessions';
import { generateFeedback } from './feedback';
import { generateRoadmap } from './roadmap';
import { summarizeMatchReport } from './matchEngine';
import { computeVoiceMetrics } from './voiceMetrics';
import type { InterviewState } from './interviewEngine';

export interface FinalizeResult {
  sessionId: string;
  report: NonNullable<ReturnType<typeof getSessionRecord>>['feedback'];
  roadmap: unknown;
  score: number;
  durationMs: number;
}

/** Compute elapsed session duration in ms from the record's startedAt. */
export function sessionElapsedMs(sessionId: string): number {
  const session = getSessionRecord(sessionId);
  if (!session?.startedAt) return 0;
  return Date.now() - new Date(session.startedAt).getTime();
}

/**
 * Generate feedback + roadmap, persist them on the session, mark it
 * COMPLETED, and return the persisted artifacts. Never throws — on failure
 * it still marks the session completed.
 */
export async function finalizeInterview(sessionId: string, state: InterviewState): Promise<FinalizeResult> {
  state.completed = true;
  const session = getSessionRecord(sessionId);
  if (!session) {
    return { sessionId, report: null, roadmap: null, score: 0, durationMs: 0 };
  }

  const durationMs = session.durationMs ?? sessionElapsedMs(sessionId);

  try {
    const { report } = await generateFeedback({
      role: state.role,
      company: state.company,
      mode: state.mode,
      difficulty: state.difficulty,
      transcript: state.transcript,
      analysis: state.analysis,
      resumeProfile: session?.resumeProfile ?? state.resumeProfile ?? null,
      jdProfile: session?.jdProfile ?? state.jdProfile ?? null,
      skills: session?.skills ?? state.skills ?? null,
      matchSummary: session?.matchReport ? summarizeMatchReport(session.matchReport) : (state.matchSummary ?? null),
      githubAnalysis: session?.githubSummary ?? state.githubSummary ?? null,
      coding: session?.coding ?? null,
      voice: session?.voice ? computeVoiceMetrics(session.voice, state.transcript) : null,
    });

    let roadmap = session.roadmap || null;
    if (!roadmap) {
      try {
        const res = await generateRoadmap({
          role: state.role,
          company: state.company,
          mode: state.mode,
          focusAreas: report.nextTopics.length ? report.nextTopics : state.analysis?.focusAreas,
          strengths: report.strengths.length ? report.strengths : state.analysis?.strengths,
        });
        roadmap = res.roadmap;
      } catch {
        roadmap = null;
      }
    }

    updateSessionRecord(sessionId, {
      status: 'COMPLETED',
      score: report.score,
      feedback: report,
      roadmap,
      durationMs,
    });

    return { sessionId, report, roadmap, score: report.score, durationMs };
  } catch (err) {
    console.error('[Finalizer] feedback generation failed:', (err as Error).message);
    updateSessionRecord(sessionId, { status: 'COMPLETED', durationMs });
    return { sessionId, report: null, roadmap: null, score: 0, durationMs };
  }
}
