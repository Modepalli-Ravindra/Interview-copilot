/**
 * Phase 6 — Voice interview REST routes.
 *
 * The primary real-time path is the Socket.IO `/interview` namespace
 * (browser STT/TTS + `text_message`). This REST surface is the
 * transport-agnostic twin of that path: it drives the SAME interview
 * engine (via the shared session registry), persists voice metadata, and
 * validates the voice state machine. It enables deterministic offline
 * testing and a clean text-mode fallback that never depends on sockets.
 *
 * Backend is authoritative for: voice metrics, state transitions, question
 * dedup, completion, and report provenance. Client reports are validated,
 * clamped, and accumulated — never trusted wholesale.
 */

import { Router, Request, Response } from 'express';
import { getSessionRecord, getOwnedSessionRecord, updateSessionRecord } from './sessions';
import { createInterviewStateForSession, getInterviewState, runExclusive } from '../services/interviewSessionRegistry';
import { handleInterviewAnswer } from '../services/interviewEngine';
import { canTransition } from '../services/voiceStateMachine';
import { computeVoiceMetrics } from '../services/voiceMetrics';
import { finalizeInterview } from '../services/interviewFinalizer';
import {
  createDefaultVoiceMeta,
  VOICE_STATES,
  type VoiceInterviewState,
  type VoiceMode,
  type VoiceSessionMeta,
} from '../services/voiceTypes';

const router = Router();

const VALID_MODES: VoiceMode[] = ['voice', 'text'];
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes per answer

function voiceOf(session: Record<string, any>): VoiceSessionMeta {
  return { ...createDefaultVoiceMeta(), ...(session.voice || {}) };
}

function isState(v: unknown): v is VoiceInterviewState {
  return typeof v === 'string' && (VOICE_STATES as string[]).includes(v);
}

// POST /api/voice/:id/config — set the voice/text mode + browser capability.
router.post('/:id/config', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const voice = voiceOf(session);
  const { mode, enabled, sttSupported, ttsSupported } = req.body || {};

  if (mode !== undefined && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ success: false, error: `mode must be one of ${VALID_MODES.join(', ')}` });
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
  }
  if (sttSupported !== undefined && sttSupported !== null && typeof sttSupported !== 'boolean') {
    return res.status(400).json({ success: false, error: 'sttSupported must be a boolean or null' });
  }
  if (ttsSupported !== undefined && ttsSupported !== null && typeof ttsSupported !== 'boolean') {
    return res.status(400).json({ success: false, error: 'ttsSupported must be a boolean or null' });
  }

  if (mode !== undefined) voice.mode = mode;
  if (enabled !== undefined) voice.enabled = enabled;
  if (sttSupported !== undefined) voice.sttSupported = sttSupported;
  if (ttsSupported !== undefined) voice.ttsSupported = ttsSupported;
  if (voice.enabled && !voice.startedAt) voice.startedAt = new Date().toISOString();

  updateSessionRecord(session.id, { voice });
  res.json({ success: true, data: { voice } });
});

// POST /api/voice/:id/state — report a voice state-machine transition.
router.post('/:id/state', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const { from, to, interruption } = req.body || {};
  if (!isState(from) || !isState(to)) {
    return res.status(400).json({ success: false, error: `from/to must be valid voice states (${VOICE_STATES.join(', ')})` });
  }
  if (!canTransition(from, to, { interruption: Boolean(interruption) })) {
    return res.status(409).json({
      success: false,
      error: `Invalid voice state transition: ${from} -> ${to}${interruption ? ' (interruption)' : ''}`,
    });
  }

  const voice = voiceOf(session);
  voice.state = to;
  if (to === 'COMPLETED' && !voice.endedAt) voice.endedAt = new Date().toISOString();
  if (Boolean(interruption) && from === 'AI_SPEAKING') voice.interruptions += 1;

  updateSessionRecord(session.id, { voice });
  res.json({ success: true, data: { voice } });
});

// POST /api/voice/:id/interruption — record a barge-in (AI was interrupted).
router.post('/:id/interruption', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const voice = voiceOf(session);
  voice.interruptions += 1;
  updateSessionRecord(session.id, { voice });
  res.json({ success: true, data: { voice } });
});

// GET /api/voice/:id/status — resume-safe status (voice meta + transcript).
router.get('/:id/status', (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const state = getInterviewState(session.id);
  const voice = voiceOf(session);
  res.json({
    success: true,
    data: {
      sessionId: session.id,
      status: session.status,
      completed: session.status === 'COMPLETED' || state?.completed === true,
      mode: session.mode,
      role: session.role,
      company: session.company,
      transcript: session.transcript || [],
      analysis: state?.analysis ?? null,
      gateway: state
        ? { provider: state.gateway.provider, fromMock: state.gateway.fromMock }
        : null,
      voice,
      metrics: computeVoiceMetrics(voice, session.transcript || []),
    },
  });
});

// POST /api/voice/:id/answer — submit a finalized candidate answer.
router.post('/:id/answer', async (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const { text, answerDurationMs, mode } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ success: false, error: 'text is required' });
  }
  let durationMs = 0;
  if (answerDurationMs !== undefined) {
    if (typeof answerDurationMs !== 'number' || !Number.isFinite(answerDurationMs) || answerDurationMs < 0) {
      return res.status(400).json({ success: false, error: 'answerDurationMs must be a non-negative number' });
    }
    durationMs = Math.min(Math.round(answerDurationMs), MAX_DURATION_MS);
  }
  const voiceMode: VoiceMode = mode === 'voice' ? 'voice' : 'text';

  try {
    const result = await runExclusive(session.id, async () => {
      let state = getInterviewState(session.id);
      if (!state) {
        state = await createInterviewStateForSession(session.id);
        if (session.status !== 'ACTIVE') {
          updateSessionRecord(session.id, { status: 'ACTIVE', startedAt: session.startedAt ?? new Date().toISOString() });
        }
      }

      const voice = voiceOf(session);
      if (voiceMode === 'voice' && durationMs > 0) {
        voice.speechTurns += 1;
        voice.answerCount += 1;
        voice.totalAnswerDurationMs += durationMs;
        voice.enabled = true;
      } else if (voiceMode === 'voice') {
        voice.speechTurns += 1;
        voice.answerCount += 1;
        voice.enabled = true;
      }
      updateSessionRecord(session.id, { voice });

      const answer = await handleInterviewAnswer(state, text.trim());
      updateSessionRecord(session.id, { transcript: state.transcript });

      if (answer.completed) {
        const finalized = await finalizeInterview(session.id, state);
        return {
          answer,
          transcript: state.transcript,
          voice,
          metrics: computeVoiceMetrics(voice, state.transcript),
          finalized,
        };
      }
      return {
        answer,
        transcript: state.transcript,
        voice,
        metrics: computeVoiceMetrics(voice, state.transcript),
        finalized: null,
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    if (/already in progress/i.test(message)) {
      return res.status(409).json({ success: false, error: message });
    }
    console.error('[Voice:answer] failed:', message);
    return res.status(502).json({ success: false, error: 'The AI interviewer failed to respond. Please try again.' });
  }
});

// POST /api/voice/:id/end — finish the interview and generate the report.
router.post('/:id/end', async (req: Request, res: Response) => {
  const session = getOwnedSessionRecord(req.params.id, req.user?.userId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  try {
    const result = await runExclusive(session.id, async () => {
      let state = getInterviewState(session.id);
      if (!state) state = await createInterviewStateForSession(session.id);

      const voice = voiceOf(session);
      if (!voice.endedAt) {
        voice.endedAt = new Date().toISOString();
        voice.state = 'COMPLETED';
        updateSessionRecord(session.id, { voice });
      }

      if (session.status === 'COMPLETED' && session.feedback) {
        return {
          sessionId: session.id,
          report: session.feedback,
          score: session.score,
          alreadyCompleted: true,
        };
      }

      const finalized = await finalizeInterview(session.id, state);
      return {
        sessionId: session.id,
        report: finalized.report,
        score: finalized.score,
        alreadyCompleted: false,
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    if (/already in progress/i.test(message)) {
      return res.status(409).json({ success: false, error: message });
    }
    console.error('[Voice:end] failed:', message);
    return res.status(502).json({ success: false, error: 'Failed to finalize the interview.' });
  }
});

export default router;
