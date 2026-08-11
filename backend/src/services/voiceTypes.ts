/**
 * Phase 6 — Shared voice-interview types.
 *
 * The existing interview engine + transcript remain the single source of
 * truth for interview content. These types describe only the VOICE layer:
 * the persisted voice session metadata (browser capability, mode, timings),
 * the voice state machine, and server-computed voice metrics.
 *
 * Everything here is additive — no existing interview field is replaced.
 */

/** Browser-facing mode for how the candidate answers. */
export type VoiceMode = 'voice' | 'text';

/**
 * Voice interview state machine. The backend validates every transition
 * (see voiceStateMachine.ts); the browser drives STT/TTS transitions and
 * reports them to the server, which persists the canonical state.
 */
export type VoiceInterviewState =
  | 'IDLE'
  | 'AI_THINKING'
  | 'AI_SPEAKING'
  | 'LISTENING'
  | 'PROCESSING_ANSWER'
  | 'FOLLOW_UP'
  | 'COMPLETED'
  | 'ERROR';

export const VOICE_STATES: VoiceInterviewState[] = [
  'IDLE',
  'AI_THINKING',
  'AI_SPEAKING',
  'LISTENING',
  'PROCESSING_ANSWER',
  'FOLLOW_UP',
  'COMPLETED',
  'ERROR',
];

/**
 * Persisted per-session voice metadata. Stored on the session record as
 * `session.voice`. Counters are accumulated server-side from client
 * reports; the transcript is NOT duplicated here.
 */
export interface VoiceSessionMeta {
  /** Whether voice was used at all in this session. */
  enabled: boolean;
  /** How the candidate is answering. */
  mode: VoiceMode;
  /** Canonical voice state machine state. */
  state: VoiceInterviewState;
  startedAt: string | null;
  endedAt: string | null;
  /** Total interruptions reported (barge-ins). */
  interruptions: number;
  /** Number of answers spoken (voice mode). */
  speechTurns: number;
  /** Accumulated spoken answer duration in ms (voice mode). */
  totalAnswerDurationMs: number;
  /** Number of duration samples accumulated. */
  answerCount: number;
  /** Browser capability flags (null = unknown / not reported). */
  sttSupported: boolean | null;
  ttsSupported: boolean | null;
}

export function createDefaultVoiceMeta(): VoiceSessionMeta {
  return {
    enabled: false,
    mode: 'text',
    state: 'IDLE',
    startedAt: null,
    endedAt: null,
    interruptions: 0,
    speechTurns: 0,
    totalAnswerDurationMs: 0,
    answerCount: 0,
    sttSupported: null,
    ttsSupported: null,
  };
}

/**
 * Server-derived voice metrics. Every number is computed by the backend
 * from persisted voice metadata + the transcript. Fields that cannot be
 * derived are `null` (never invented). `available` describes which
 * dimensions have real data.
 */
export interface VoiceMetrics {
  voiceEnabled: boolean;
  voiceMode: VoiceMode;
  /** Total interviewer/coach questions asked in this session. */
  totalVoiceQuestions: number;
  /** Number of candidate answers given. */
  answeredQuestions: number;
  /** Average spoken answer duration in ms (null when no samples). */
  averageAnswerDurationMs: number | null;
  /** Total spoken answer time in ms. */
  totalSpeakingTimeMs: number;
  /** Average spoken answer time (same as averageAnswerDurationMs). */
  averageSpeakingTimeMs: number | null;
  /** Number of interruptions (barge-ins). */
  interruptionCount: number;
  /** Number of answers that came through speech (voice mode). */
  speechTurnCount: number;
  /** Total voice-session duration in ms (startedAt..endedAt). */
  voiceSessionDurationMs: number | null;
  /** Human-friendly flag set: which voice dimensions have data. */
  available: {
    durations: boolean;
    interruptions: boolean;
    speechTurns: boolean;
    sessionDuration: boolean;
  };
}

/** Per-answer voice record, accumulated server-side (additive, capped). */
export interface VoiceAnswerRecord {
  durationMs: number;
  mode: VoiceMode;
  at: string;
}
