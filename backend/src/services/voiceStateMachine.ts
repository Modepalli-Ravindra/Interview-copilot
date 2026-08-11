/**
 * Phase 6 — Voice state machine (server-authoritative).
 *
 * The state machine is defined AND validated server-side so the persisted
 * `session.voice.state` can never become logically inconsistent (e.g.
 * AI_SPEAKING + LISTENING at the same time). The browser reports every
 * transition to `POST /api/voice/:id/state`; the backend rejects invalid
 * jumps unless they are explicit interruptions.
 */

import type { VoiceInterviewState } from './voiceTypes';

/** Allowed direct transitions. Anything not listed is invalid. */
const TRANSITIONS: Record<VoiceInterviewState, VoiceInterviewState[]> = {
  IDLE: ['AI_THINKING', 'AI_SPEAKING', 'LISTENING', 'COMPLETED', 'ERROR'],
  AI_THINKING: ['AI_SPEAKING', 'PROCESSING_ANSWER', 'ERROR'],
  AI_SPEAKING: ['LISTENING', 'PROCESSING_ANSWER', 'AI_THINKING', 'FOLLOW_UP', 'ERROR'],
  LISTENING: ['PROCESSING_ANSWER', 'AI_THINKING', 'ERROR'],
  PROCESSING_ANSWER: ['AI_THINKING', 'FOLLOW_UP', 'LISTENING', 'COMPLETED', 'ERROR'],
  FOLLOW_UP: ['AI_THINKING', 'AI_SPEAKING', 'LISTENING', 'COMPLETED', 'ERROR'],
  COMPLETED: ['ERROR'],
  ERROR: ['IDLE', 'AI_THINKING', 'LISTENING'],
};

/**
 * Whether a transition is legal. `from === to` is always allowed (idempotent
 * re-report of the current state). Interruptions permit the AI_SPEAKING ->
 * LISTENING jump, which is otherwise forbidden.
 */
export function canTransition(
  from: VoiceInterviewState,
  to: VoiceInterviewState,
  opts: { interruption?: boolean } = {},
): boolean {
  if (from === to) return true;
  const allowed = TRANSITIONS[from] || [];
  if (allowed.includes(to)) return true;
  // Interruption: the candidate cuts the AI off mid-speech to answer.
  if (opts.interruption && from === 'AI_SPEAKING' && to === 'LISTENING') return true;
  // Recovery: an error may be cleared back into the loop from any state.
  if (from === 'ERROR' && (to === 'AI_THINKING' || to === 'LISTENING')) return true;
  return false;
}

/** All valid next states from a given state (without interruption intent). */
export function nextStates(from: VoiceInterviewState): VoiceInterviewState[] {
  return TRANSITIONS[from] || [];
}
