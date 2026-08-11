import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getSessionRecord, updateSessionRecord } from '../routes/sessions';
import { getJwtSecret } from '../services/jwtSecret';
import { gatewayStatus, abortGatewaySession } from '../services/aiGateway';
import { startInterview, handleInterviewAnswer, deeperFollowUp, type InterviewState } from '../services/interviewEngine';
import {
  getInterviewState,
  setInterviewState,
  createInterviewStateForSession,
} from '../services/interviewSessionRegistry';
import { finalizeInterview } from '../services/interviewFinalizer';
import { createDefaultVoiceMeta, type VoiceSessionMeta } from '../services/voiceTypes';
import { isSemanticDuplicate } from '../services/questionDedup';

const socketSessions = new Map<string, string>(); // socketId -> sessionId
const busySessions = new Set<string>();
const connectionsByIp = new Map<string, number>(); // ip -> active sockets
const lastTurnAt = new Map<string, number>(); // sessionId -> last candidate turn timestamp

const MAX_CONNECTIONS_PER_IP = 5;
const MIN_TURN_INTERVAL_MS = 1200;

function socketTokenOk(socket: Socket): boolean {
  // Offline smoke-test mode — synthetic identity, mirroring the REST layer.
  if (process.env.AUTH_TEST_MODE === 'true') {
    socket.data.user = { userId: 'test-user', email: 'test@example.com', name: 'Test User' };
    return true;
  }
  const token = (socket.handshake.auth && socket.handshake.auth.token) || '';
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string; email?: string; name?: string };
    socket.data.user = { userId: decoded.userId, email: decoded.email, name: decoded.name };
    return true;
  } catch {
    return false;
  }
}

function emitTranscript(namespace: Namespace, sessionId: string, sender: string, text: string) {
  namespace.to(`session:${sessionId}`).emit('transcript_update', {
    sender,
    text,
    isFinal: true,
    timestamp: new Date().toISOString(),
  });
}

/** Voice metadata helper — load (with defaults) from the session record. */
function voiceOf(session: Record<string, any> | undefined): VoiceSessionMeta {
  return { ...createDefaultVoiceMeta(), ...(session?.voice || {}) };
}

/**
 * Last-resort guard against repeated questions. The live engine already
 * instructs the model to avoid repeating asked questions; if it still echoes
 * an earlier interviewer/teaching line (verbatim or trivially reworded), swap
 * in a generic deeper follow-up so the candidate never hears the same
 * question twice.
 */
function guardAgainstRepeat<T extends { sender: 'interviewer' | 'teaching'; text: string }>(
  state: InterviewState,
  turn: T,
): T {
  const earlier = state.transcript.filter(
    (m) => (m.sender === 'interviewer' || m.sender === 'teaching') && m.text !== turn.text,
  );
  if (earlier.some((m) => isSemanticDuplicate(turn.text, m.text))) {
    return {
      ...turn,
      sender: 'interviewer' as const,
      text: deeperFollowUp(earlier.map((m) => m.text)),
    };
  }
  return turn;
}

/**
 * Generate the feedback report + roadmap, persist them, and emit session_ended.
 * Delegates the actual generation to the shared finalizer so the Socket.IO
 * path and the REST voice path produce identical results.
 */
async function finalizeSession(namespace: Namespace, sessionId: string, state: InterviewState) {
  const finalized = await finalizeInterview(sessionId, state);
  namespace.to(`session:${sessionId}`).emit('session_ended', {
    sessionId,
    score: finalized.score,
    hasReport: Boolean(finalized.report),
  });
}

export function registerInterviewHandlers(namespace: Namespace) {
  namespace.on('connection', (socket: Socket) => {
    if (!socketTokenOk(socket)) {
      console.warn(`[WS:interview] Unauthorized connection rejected: ${socket.id}`);
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
      return;
    }
    const ip = (socket.handshake.address || 'unknown').replace(/^::ffff:/, '');
    const ipCount = (connectionsByIp.get(ip) || 0) + 1;
    if (ipCount > MAX_CONNECTIONS_PER_IP) {
      console.warn(`[WS:interview] Too many connections from ${ip}, rejecting ${socket.id}`);
      socket.emit('error', { message: 'Too many connections.' });
      socket.disconnect(true);
      return;
    }
    connectionsByIp.set(ip, ipCount);

    console.log(`[WS:interview] Client connected: ${socket.id} (${ip})`);

    // ── join_session ─────────────────────────────────────
    socket.on('join_session', async ({ sessionId }: { sessionId: string }) => {
      const record = getSessionRecord(sessionId);
      if (!record) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }
      // Legacy sessions (no userId) stay reachable by any authenticated user;
      // owned sessions are restricted to their owner.
      if (record.userId && record.userId !== socket.data.user?.userId) {
        socket.emit('error', { message: 'Unauthorized: not your session' });
        return;
      }
      socket.join(`session:${sessionId}`);
      socketSessions.set(socket.id, sessionId);

      const existing = getInterviewState(sessionId);
      if (existing) {
        socket.emit('session_joined', {
          sessionId,
          gateway: {
            ...gatewayStatus(),
            provider: existing.gateway.provider,
            fromMock: existing.gateway.fromMock,
          },
          transcript: existing.transcript,
          analysis: existing.analysis,
          completed: existing.completed,
        });
        return;
      }

      const state = await createInterviewStateForSession(sessionId);
      updateSessionRecord(sessionId, { status: 'ACTIVE', startedAt: new Date().toISOString() });

      socket.emit('session_joined', {
        sessionId,
        gateway: {
          ...gatewayStatus(),
          provider: state.gateway.provider,
          fromMock: state.gateway.fromMock,
        },
        transcript: [],
        analysis: null,
        completed: false,
      });

      // Ask the gateway to analyze the resume and open the interview
      socket.emit('thinking', { on: true });
      try {
        const { analysis, question } = await startInterview(state);
        socket.emit('resume_analysis', { analysis });
        emitTranscript(namespace, sessionId, 'interviewer', question);
      } catch (err) {
        console.error('[WS:interview] startInterview failed:', (err as Error).message);
        emitTranscript(namespace, sessionId, 'system', 'The AI interviewer failed to start. Please try again.');
      } finally {
        socket.emit('thinking', { on: false });
      }
    });

    // ── text_message ──────────────────────────────────────
    // Real-time voice STT from the client arrives here as text. Optional
    // `meta` carries browser-measured answer timings (voice mode only);
    // the backend clamps + accumulates them into the persisted voice record.
    socket.on('text_message', async ({ sessionId: clientSessionId, text, meta }: { sessionId: string; text: string; meta?: { answerDurationMs?: number; mode?: string } }) => {
      // Session authority = the session this socket actually joined. `join_session`
      // already verified ownership, so a client-supplied sessionId that does not
      // match the joined session is ignored — a socket can never touch another
      // user's session via this event.
      const sessionId = socketSessions.get(socket.id);
      if (!sessionId || (clientSessionId && clientSessionId !== sessionId)) return;
      const record = getSessionRecord(sessionId);
      if (!record) return;
      if (record.userId && record.userId !== socket.data.user?.userId) return;

      const state = getInterviewState(sessionId);
      if (!state || busySessions.has(sessionId)) return;
      if (state.completed) return;
      if (!text || !text.trim()) return;

      // Throttle rapid-fire messages (prevents AI provider abuse).
      const now = Date.now();
      const last = lastTurnAt.get(sessionId) || 0;
      if (now - last < MIN_TURN_INTERVAL_MS) return;
      lastTurnAt.set(sessionId, now);

      busySessions.add(sessionId);
      namespace.to(`session:${sessionId}`).emit('thinking', { on: true });
      emitTranscript(namespace, sessionId, 'candidate', text.trim());

      try {
        // Persist voice timings (clamped server-side) before the turn runs.
        if (meta) {
          const session = getSessionRecord(sessionId);
          const voice = voiceOf(session);
          const isVoice = meta.mode === 'voice';
          if (isVoice) {
            const raw = typeof meta.answerDurationMs === 'number' && Number.isFinite(meta.answerDurationMs)
              ? Math.max(0, Math.min(Math.round(meta.answerDurationMs), 10 * 60 * 1000))
              : 0;
            voice.speechTurns += 1;
            voice.answerCount += 1;
            voice.totalAnswerDurationMs += raw;
            voice.enabled = true;
            if (!voice.startedAt) voice.startedAt = new Date().toISOString();
          }
          updateSessionRecord(sessionId, { voice });
        }

        const result = await handleInterviewAnswer(state, text.trim());
        const guarded = guardAgainstRepeat(state, result);
        emitTranscript(namespace, sessionId, guarded.sender, guarded.text);
        updateSessionRecord(sessionId, { transcript: state.transcript });
        if (guarded.completed) {
          const session = getSessionRecord(sessionId);
          if (session?.startedAt) {
            updateSessionRecord(sessionId, {
              durationMs: Date.now() - new Date(session.startedAt).getTime(),
            });
          }
          await finalizeSession(namespace, sessionId, state);
        }
      } catch (err) {
        console.error('[WS:interview] answer failed:', (err as Error).message);
        emitTranscript(
          namespace,
          sessionId,
          'system',
          'I had trouble reaching the model. Please try your answer again.',
        );
      } finally {
        busySessions.delete(sessionId);
        namespace.to(`session:${sessionId}`).emit('thinking', { on: false });
      }
    });

    // ── barge_in ──────────────────────────────────────────
    socket.on('barge_in', () => {
      console.log(`[WS:interview] Barge-in from ${socket.id}`);
      const sessionId = socketSessions.get(socket.id);
      const state = sessionId ? getInterviewState(sessionId) : undefined;
      if (state && !state.gateway.fromMock) {
        abortGatewaySession(state.gateway.gatewaySessionId).catch(() => {});
      }
      // Count the interruption server-side (persisted voice metric).
      if (sessionId) {
        const session = getSessionRecord(sessionId);
        const voice = voiceOf(session);
        voice.interruptions += 1;
        updateSessionRecord(sessionId, { voice });
      }
      socket.emit('clear_audio_buffer');
    });

    // ── end_session ───────────────────────────────────────
    socket.on('end_session', (_payload: { sessionId?: string }) => {
      // Session authority = the joined session (ownership verified at join).
      // The client-supplied sessionId is ignored so a socket can only ever end
      // its own joined session.
      const sessionId = socketSessions.get(socket.id);
      if (!sessionId) return;
      console.log(`[WS:interview] Session ended: ${sessionId}`);
      socket.leave(`session:${sessionId}`);
      const state = getInterviewState(sessionId);
      if (state && !state.gateway.fromMock) {
        abortGatewaySession(state.gateway.gatewaySessionId).catch(() => {});
      }
      if (state && !state.completed) {
        const session = getSessionRecord(sessionId);
        if (session?.startedAt) {
          updateSessionRecord(sessionId, {
            durationMs: Date.now() - new Date(session.startedAt).getTime(),
          });
        }
        finalizeSession(namespace, sessionId, state).catch(() => {});
      } else {
        socket.emit('session_ended', { sessionId });
      }
    });

    // ── disconnect ────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[WS:interview] Client ${socket.id} disconnected: ${reason}`);
      socketSessions.delete(socket.id);
      const remaining = (connectionsByIp.get(ip) || 1) - 1;
      if (remaining <= 0) connectionsByIp.delete(ip);
      else connectionsByIp.set(ip, remaining);
    });
  });
}
