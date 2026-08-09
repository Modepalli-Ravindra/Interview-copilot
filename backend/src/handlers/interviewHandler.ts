import { Namespace, Socket } from 'socket.io';
import { getSessionRecord, updateSessionRecord } from '../routes/sessions';
import { gatewayStatus, abortGatewaySession } from '../services/aiGateway';
import { generateFeedback } from '../services/feedback';
import { generateRoadmap } from '../services/roadmap';
import {
  createInterviewState,
  startInterview,
  handleInterviewAnswer,
  type InterviewState,
  type InterviewMode,
} from '../services/interviewEngine';

const interviewStates = new Map<string, InterviewState>();
const socketSessions = new Map<string, string>(); // socketId -> sessionId
const busySessions = new Set<string>();
const connectionsByIp = new Map<string, number>(); // ip -> active sockets
const lastTurnAt = new Map<string, number>(); // sessionId -> last candidate turn timestamp

const MAX_CONNECTIONS_PER_IP = 5;
const MIN_TURN_INTERVAL_MS = 1200;

function socketTokenOk(socket: Socket): boolean {
  if (process.env.AUTH_ENABLED !== 'true') return true;
  const expected = process.env.AUTH_TOKEN;
  if (!expected) return false;
  const token = (socket.handshake.auth && socket.handshake.auth.token) || '';
  return token === expected;
}

function emitTranscript(namespace: Namespace, sessionId: string, sender: string, text: string) {
  namespace.to(`session:${sessionId}`).emit('transcript_update', {
    sender,
    text,
    isFinal: true,
    timestamp: new Date().toISOString(),
  });
}

/** Generate the feedback report + roadmap, persist them, and emit session_ended. */
async function finalizeSession(namespace: Namespace, sessionId: string, state: InterviewState) {
  state.completed = true;
  const session = getSessionRecord(sessionId);
  if (!session) return;

  try {
    const { report } = await generateFeedback({
      role: state.role,
      company: state.company,
      mode: state.mode,
      transcript: state.transcript,
      analysis: state.analysis,
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

    const durationMs = session.durationMs ?? 0;
    updateSessionRecord(sessionId, {
      status: 'COMPLETED',
      score: report.score,
      feedback: report,
      roadmap,
      durationMs,
    });
  } catch (err) {
    console.error('[WS:interview] finalize failed:', (err as Error).message);
    updateSessionRecord(sessionId, { status: 'COMPLETED' });
  } finally {
    namespace.to(`session:${sessionId}`).emit('session_ended', { sessionId });
  }
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
      socket.join(`session:${sessionId}`);
      socketSessions.set(socket.id, sessionId);

      const existing = interviewStates.get(sessionId);
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

      const record = getSessionRecord(sessionId);
      const state = await createInterviewState({
        sessionId,
        mode: (record?.mode || 'TECHNICAL') as InterviewMode,
        role: record?.role || 'Software Engineer',
        company: record?.company || 'Company',
        resumeText: record?.resumeText || '',
        jdText: record?.jdText || '',
        githubSummary: record?.githubSummary || '',
      });
      interviewStates.set(sessionId, state);
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
    // Real-time voice STT from the client arrives here as text.
    socket.on('text_message', async ({ sessionId, text }: { sessionId: string; text: string }) => {
      const state = interviewStates.get(sessionId);
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
        const result = await handleInterviewAnswer(state, text.trim());
        emitTranscript(namespace, sessionId, result.sender, result.text);
        updateSessionRecord(sessionId, { transcript: state.transcript });
        if (result.completed) {
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
      const state = sessionId ? interviewStates.get(sessionId) : undefined;
      if (state && !state.gateway.fromMock) {
        abortGatewaySession(state.gateway.gatewaySessionId).catch(() => {});
      }
      socket.emit('clear_audio_buffer');
    });

    // ── end_session ───────────────────────────────────────
    socket.on('end_session', ({ sessionId }: { sessionId: string }) => {
      console.log(`[WS:interview] Session ended: ${sessionId}`);
      socket.leave(`session:${sessionId}`);
      const state = interviewStates.get(sessionId);
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
