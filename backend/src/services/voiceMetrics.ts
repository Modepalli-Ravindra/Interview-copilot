/**
 * Phase 6 — Voice metrics (server-derived).
 *
 * All numbers come from the persisted `session.voice` metadata (accumulated
 * from client-reported timings) plus the existing interview transcript.
 * Nothing is invented: dimensions without data are `null` and flagged in
 * `available`, so the UI can never display fake voice statistics.
 */

import type { VoiceMetrics, VoiceSessionMeta } from './voiceTypes';

interface TranscriptMessage {
  sender: string;
  text: string;
  timestamp?: string;
}

export function computeVoiceMetrics(
  voice: VoiceSessionMeta | null | undefined,
  transcript: TranscriptMessage[] = [],
): VoiceMetrics {
  const v = voice ?? {
    enabled: false,
    mode: 'text' as const,
    state: 'IDLE' as const,
    startedAt: null,
    endedAt: null,
    interruptions: 0,
    speechTurns: 0,
    totalAnswerDurationMs: 0,
    answerCount: 0,
    sttSupported: null,
    ttsSupported: null,
  };

  const questions = (transcript || []).filter((m) => m.sender === 'interviewer' || m.sender === 'teaching');
  const answers = (transcript || []).filter((m) => m.sender === 'candidate');

  const totalSpeakingTimeMs = v.totalAnswerDurationMs;
  const averageAnswerDurationMs =
    v.answerCount > 0 ? Math.round(totalSpeakingTimeMs / v.answerCount) : null;

  let voiceSessionDurationMs: number | null = null;
  if (v.startedAt && v.endedAt) {
    const d = new Date(v.endedAt).getTime() - new Date(v.startedAt).getTime();
    if (Number.isFinite(d) && d >= 0) voiceSessionDurationMs = d;
  }

  return {
    voiceEnabled: v.enabled,
    voiceMode: v.mode,
    totalVoiceQuestions: questions.length,
    answeredQuestions: answers.length,
    averageAnswerDurationMs,
    totalSpeakingTimeMs,
    averageSpeakingTimeMs: averageAnswerDurationMs,
    interruptionCount: v.interruptions || 0,
    speechTurnCount: v.speechTurns || 0,
    voiceSessionDurationMs,
    available: {
      durations: v.answerCount > 0,
      interruptions: typeof v.interruptions === 'number' && v.interruptions > 0,
      speechTurns: v.speechTurns > 0,
      sessionDuration: voiceSessionDurationMs != null,
    },
  };
}
