import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Code2, Layers, ChevronLeft, Timer, Settings2, CheckCircle2, XCircle, MessageSquare, Radio, Sparkles, FileText, AlertTriangle, X, Loader2, ShieldAlert } from 'lucide-react';
import VoiceWidget from '../components/interview/VoiceWidget';
import TranscriptPanel from '../components/interview/TranscriptPanel';
import CodeWorkspace from '../components/interview/CodeWorkspace';
import AiAvatar from '../components/interview/AiAvatar';
import { useInterviewStore } from '../stores/interviewStore';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { socketService, classifyServerEventError } from '../services/socketService';
import { apiFetch, getAuthToken, clearAuthToken } from '../lib/api';
import { playChime } from '../lib/voice';
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery';
import type { Problem, FeedbackReport, GeneratedQuestion } from '../types';

type TabMode = 'transcript' | 'code' | 'problem';

const MOCK_AMPLITUDES_ACTIVE = () => Array.from({ length: 16 }, () => Math.random() * 0.85 + 0.15);
const MOCK_AMPLITUDES_IDLE   = Array(16).fill(0.06);

interface ResumeAnalysis {
  summary: string;
  strengths: string[];
  focusAreas: string[];
}

const severityColor: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH:   'hsl(0 85% 60%)',
  MEDIUM: 'hsl(35 90% 55%)',
  LOW:    'hsl(142 70% 50%)',
};

const scoreColor = (s: number) =>
  s >= 90 ? 'hsl(142 70% 50%)' : s >= 75 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';

const HANDSHAKE_TIMEOUT_MS = 15000;

type ConnectionPhase = 'auth-required' | 'connecting' | 'auth-error' | 'error' | 'ready';

interface InterviewConnState {
  phase: ConnectionPhase;
  message?: string;
}

function ConnectionGate({ state, onRetry, onLogin, onDashboard }: {
  state: InterviewConnState;
  onRetry: () => void;
  onLogin: () => void;
  onDashboard: () => void;
}) {
  const primaryBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
    background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
    color: 'hsl(220 15% 5%)',
  };
  const ghostBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 22px', borderRadius: 10, cursor: 'pointer',
    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
    background: 'transparent', color: 'hsl(210 10% 55%)',
    border: '1px solid hsl(215 15% 22%)',
  };

  let icon: React.ReactNode;
  let title: string;
  let body: string;
  let actions: React.ReactNode;

  if (state.phase === 'auth-required' || state.phase === 'auth-error') {
    icon = <ShieldAlert size={34} color="hsl(35 90% 60%)" />;
    title = state.phase === 'auth-required' ? 'Sign in required' : 'Session expired';
    body = state.message || 'Please sign in to continue your interview session.';
    actions = (
      <>
        <button onClick={onLogin} style={primaryBtn}>Go to Login</button>
        <button onClick={onDashboard} style={ghostBtn}>Back to Dashboard</button>
      </>
    );
  } else if (state.phase === 'connecting') {
    icon = (
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
        <Loader2 size={34} color="hsl(174 85% 65%)" />
      </motion.div>
    );
    title = 'Connecting';
    body = 'Connecting to your interview session…';
    actions = (
      <button onClick={onDashboard} style={ghostBtn}>Back to Dashboard</button>
    );
  } else {
    icon = <AlertTriangle size={34} color="hsl(35 90% 60%)" />;
    title = 'Connection problem';
    body = state.message || 'Unable to connect to the interview session.';
    actions = (
      <>
        <button onClick={onRetry} style={primaryBtn}>Retry</button>
        <button onClick={onDashboard} style={ghostBtn}>Back to Dashboard</button>
      </>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'hsl(220 15% 5%)', fontFamily: 'var(--font-sans)', padding: 24,
    }}>
      <div className="glass" style={{
        maxWidth: 420, width: '100%', borderRadius: 18,
        padding: 'clamp(20px, 6vw, 36px)',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          {icon}
        </div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'hsl(210 10% 90%)' }}>
          {title}
        </h2>
        <p style={{ margin: '10px 0 24px', fontSize: 13, lineHeight: 1.6, color: 'hsl(210 10% 52%)' }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {actions}
        </div>
      </div>
    </div>
  );
}

export default function InterviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();
  const [activeTab, setActiveTab] = useState<TabMode>('transcript');
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [gateway, setGateway] = useState<{ provider: string; enabled: boolean; fromMock: boolean } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [generated, setGenerated] = useState<GeneratedQuestion | null>(null);
  const [feedback, setFeedback] = useState<FeedbackReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ role: string; company: string; mode: string }>({ role: 'Software Engineer', company: 'Unknown', mode: 'TECHNICAL' });

  // Connection handshake: explicit, never silently stuck.
  const [connState, setConnState] = useState<InterviewConnState>({ phase: 'connecting' });
  const [joinAttempt, setJoinAttempt] = useState(0);
  const handshakeTimerRef = useRef<number | null>(null);
  const completeRef = useRef(false);

  const {
    setConnected, setRecording, setPlayingAudio,
    setAudioAmplitudes, addTranscript, isRecording, isPlayingAudio,
    speechEnabled, transcript,
  } = useInterviewStore();

  const { supported: synthesisSupported, speak: synthesisSpeak, cancel: synthesisCancel } = useSpeechSynthesis();

  // Real-time TTS for incoming AI messages (transcript is added by the backend)
  const speakRef = useRef<(text: string) => void>(() => {});
  speakRef.current = (text) => {
    setPlayingAudio(true);
    if (speechEnabled && synthesisSupported) {
      synthesisSpeak(text, () => setPlayingAudio(false));
    } else {
      window.setTimeout(() => setPlayingAudio(false), Math.min(7000, 1200 + text.length * 45));
    }
  };

  // ── Timer ────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Waveform animator ────────────────────────────────
  useEffect(() => {
    if (!isRecording && !isPlayingAudio) {
      setAudioAmplitudes(MOCK_AMPLITUDES_IDLE);
      return;
    }
    const interval = setInterval(() => {
      setAudioAmplitudes(MOCK_AMPLITUDES_ACTIVE());
    }, 120);
    return () => clearInterval(interval);
  }, [isRecording, isPlayingAudio, setAudioAmplitudes]);

  // Keep voice-driven state in sync with the widget
  useEffect(() => {
    setIsListening(isRecording);
  }, [isRecording]);

  // ── Real-time session: backend drives the AI ─────────
  const loadFeedback = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/feedback`);
      const json = await res.json();
      if (json.success && json.data) setFeedback(json.data as FeedbackReport);
    } catch (err) {
      console.error('[Interview] feedback load failed:', err);
    }
  }, [sessionId]);

  useEffect(() => {
    // No token -> don't even attempt a doomed connection; show an action.
    const token = getAuthToken();
    if (!token) {
      setConnected(false);
      setRecording(false);
      setPlayingAudio(false);
      setConnState({ phase: 'auth-required' });
      return;
    }

    completeRef.current = false;
    setConnState({ phase: 'connecting' });

    const clearHandshake = () => {
      if (handshakeTimerRef.current != null) {
        window.clearTimeout(handshakeTimerRef.current);
        handshakeTimerRef.current = null;
      }
    };

    const finishReady = () => {
      clearHandshake();
      setConnState({ phase: 'ready' });
    };

    const socket = socketService.connect((err) => {
      if (err.type === 'AUTH_ERROR') {
        clearAuthToken();
        setConnState({ phase: 'auth-error', message: 'Your session has expired. Please sign in again.' });
      } else {
        setConnState({ phase: 'error', message: 'Unable to connect to the interview session. Check your network and try again.' });
      }
    });
    setConnected(true);
    setRecording(false);
    setPlayingAudio(false);

    // Load session metadata + a problem for CODING/TECHNICAL modes
    (async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          apiFetch(`/api/sessions/${sessionId}`),
          apiFetch('/api/problems'),
        ]);
        if (sRes.status === 401) {
          clearAuthToken();
          setConnState({ phase: 'auth-error', message: 'Your session has expired. Please sign in again.' });
          return;
        }
        const sJson = await sRes.json();
        let mode = 'TECHNICAL';
        if (sJson.success && sJson.data) {
          mode = sJson.data.mode || 'TECHNICAL';
          setSessionInfo({
            role: sJson.data.role || 'Software Engineer',
            company: sJson.data.company || 'Unknown',
            mode,
          });
          if (sJson.data.feedback) setFeedback(sJson.data.feedback);
          if (sJson.data.status === 'COMPLETED') {
            setInterviewComplete(true);
            completeRef.current = true;
            setActiveTab('transcript');
            finishReady();
          }
        }
        const pJson = await pRes.json();
        if (pJson.success && Array.isArray(pJson.data)) {
          const twoSum = pJson.data.find((p: any) => p.id === 'two-sum') || pJson.data[0];
          if (twoSum) setProblem(twoSum);
        }

        // CODING sessions use a fresh AI-generated problem grounded in the
        // session context (with hidden tests verified server-side), falling
        // back to the static set when generation is unavailable.
        if (mode === 'CODING') {
          try {
            const genRes = await apiFetch('/api/coding/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, language: 'python', difficulty: 'Medium' }),
            });
            const genJson = await genRes.json();
            if (genJson.success && genJson.data?.question) {
              const q = genJson.data.question as GeneratedQuestion;
              setGenerated(q);
              setProblem({
                id: q.id,
                title: q.title,
                difficulty: q.difficulty,
                tags: [q.topic],
                acceptance: 100,
                minutes: 30,
                statement: [
                  q.problemStatement,
                  ...(q.constraints.length ? ['', '## Constraints', ...q.constraints.map(c => `- ${c}`)] : []),
                  ...(q.inputFormat ? ['', '## Input Format', q.inputFormat] : []),
                  ...(q.outputFormat ? ['', '## Output Format', q.outputFormat] : []),
                  ...(q.examples.length ? ['', '## Examples', ...q.examples.flatMap(ex => [`**Input:**`, `\`${ex.input}\``, `**Output:**`, `\`${ex.output}\``, ...(ex.explanation ? [`- Explanation: ${ex.explanation}`] : []), ''])] : []),
                  ...(q.expectedComplexity ? ['', `**Expected complexity:** ${q.expectedComplexity}`] : []),
                ].join('\n'),
                testCases: q.testCases,
              });
            }
          } catch (err) {
            console.warn('[Interview] dynamic problem generation failed, using static set:', (err as Error).message);
          }
        }
      } catch (err) {
        console.error('[Interview] context load failed:', err);
      }
    })();

    const onConnected = () => socketService.emit('join_session', { sessionId });
    socket.on('connect', onConnected);
    if (socket.connected) onConnected();

    const onServerError = (payload: unknown) => {
      const classified = classifyServerEventError(payload);
      if (classified.type === 'AUTH_ERROR') {
        clearAuthToken();
        setConnState({ phase: 'auth-error', message: 'Your session has expired. Please sign in again.' });
      } else {
        setConnState({ phase: 'error', message: classified.message || 'Unable to connect to the interview session.' });
      }
    };
    socket.on('error', onServerError);

    socket.on('session_joined', (data: any) => {
      if (data?.gateway) {
        setGateway({
          provider: data.gateway.provider,
          enabled: data.gateway.enabled,
          fromMock: Boolean(data.gateway.fromMock),
        });
      }
      if (data?.completed) {
        setInterviewComplete(true);
        completeRef.current = true;
      }
      finishReady();
    });

    socket.on('resume_analysis', (data: any) => {
      if (data?.analysis) setAnalysis(data.analysis);
    });

    socket.on('transcript_update', (data: any) => {
      if (data?.text == null) return;
      const sender = data.sender === 'teaching' ? 'teaching' : data.sender;
      addTranscript({ sender, text: data.text, isFinal: true });
      if (sender === 'interviewer' || sender === 'teaching') {
        speakRef.current(data.text);
      }
    });

    socket.on('thinking', (data: any) => setIsThinking(Boolean(data?.on)));

    socket.on('clear_audio_buffer', () => {
      synthesisCancel();
      setPlayingAudio(false);
      setAudioAmplitudes(MOCK_AMPLITUDES_IDLE);
    });

    socket.on('session_ended', () => {
      setInterviewComplete(true);
      completeRef.current = true;
      playChime();
      loadFeedback();
    });

    // If the live connection drops mid-interview, surface an actionable state
    // instead of hanging silently. Transient drops auto-recover via socket.io
    // reconnection + our re-join on `connect`.
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect' || completeRef.current) return;
      setConnState((prev) => {
        if (prev.phase === 'ready' || prev.phase === 'connecting') {
          return { phase: 'error', message: 'Connection to the interview session was lost.' };
        }
        return prev;
      });
    });

    // Handshake watchdog: never leave the user on an indefinite "connecting…".
    handshakeTimerRef.current = window.setTimeout(() => {
      setConnState((prev) =>
        prev.phase === 'ready'
          ? prev
          : { phase: 'error', message: 'Unable to connect to the interview session. Please try again.' },
      );
    }, HANDSHAKE_TIMEOUT_MS);

    return () => {
      clearHandshake();
      socketService.disconnect();
      setConnected(false);
      setRecording(false);
      setPlayingAudio(false);
      synthesisCancel();
    };
  }, [sessionId, joinAttempt, addTranscript, setConnected, setRecording, setPlayingAudio, setAudioAmplitudes, synthesisCancel, loadFeedback]);

  // ── Send a spoken answer to the AI engine ────────────
  const handleVoiceAnswer = useCallback((spokenText: string) => {
    const trimmed = spokenText.trim();
    if (trimmed.length === 0 || interviewComplete) return;
    socketService.emit('text_message', { sessionId, text: trimmed });
  }, [sessionId, interviewComplete]);

  // ── Barge-in ─────────────────────────────────────────
  const handleBargeIn = useCallback(() => {
    socketService.emit('barge_in', { timestamp: Date.now() });
    synthesisCancel();
    setPlayingAudio(false);
  }, [synthesisCancel, setPlayingAudio]);

  // ── End session ──────────────────────────────────────
  const handleEndSession = useCallback(() => {
    socketService.emit('end_session', { sessionId });
    socketService.disconnect();
    navigate('/dashboard');
  }, [sessionId, navigate]);

  // ── Derived state ────────────────────────────────────
  const hasTeaching = useMemo(() => transcript.some(e => e.sender === 'teaching'), [transcript]);
  const interviewerTurns = useMemo(
    () => transcript.filter(e => e.sender === 'interviewer').length,
    [transcript],
  );

  const isLive = gateway ? !gateway.fromMock : null;

  const tabs: { key: TabMode; label: string; icon: typeof Code2 }[] = [
    { key: 'transcript', label: 'Chat',    icon: MessageSquare },
    { key: 'problem',    label: 'Problem', icon: Layers },
    { key: 'code',       label: 'Code',    icon: Code2  },
  ];

  const voiceState = isPlayingAudio
    ? { text: 'AI is speaking…', color: 'hsl(35 90% 55%)' }
    : isThinking
      ? { text: 'AI is thinking…', color: 'hsl(215 80% 70%)' }
      : isListening
        ? { text: 'Listening to you…', color: 'hsl(142 70% 50%)' }
        : { text: 'AI Interviewer', color: 'hsl(210 10% 55%)' };

  // Clear, actionable state for the connection handshake — never a silent hang.
  if (connState.phase !== 'ready') {
    return (
      <ConnectionGate
        state={connState}
        onRetry={() => { setConnState({ phase: 'connecting' }); setJoinAttempt(n => n + 1); }}
        onLogin={() => navigate('/auth')}
        onDashboard={() => navigate('/dashboard/interviews')}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'hsl(220 15% 5%)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* ── Top bar ──────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
        padding: isMobile ? '10px 12px' : '12px 24px',
        background: 'hsl(215 15% 7%)',
        borderBottom: '1px solid hsl(215 15% 13%)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'hsl(210 10% 50%)', fontSize: 13,
            fontFamily: 'var(--font-sans)', padding: 0,
            transition: 'color 0.2s',
            minHeight: 40, minWidth: isNarrow ? 34 : 'auto',
            justifyContent: 'center', flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'hsl(174 85% 65%)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'hsl(210 10% 50%)')}
        >
          <ChevronLeft size={16} /> {!isNarrow && 'Dashboard'}
        </button>

        {!isNarrow && <div style={{ width: 1, height: 20, background: 'hsl(215 15% 18%)', flexShrink: 0 }} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'hsl(210 10% 88%)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            AI Interview Session
          </div>
          <div style={{ fontSize: 12, color: 'hsl(210 10% 45%)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Session {sessionId}</span>
            {isLive === true && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                color: 'hsl(142 70% 60%)', fontSize: 11, fontWeight: 600,
                padding: '1px 8px', borderRadius: 999,
                background: 'hsl(142 70% 50% / 0.12)',
                border: '1px solid hsl(142 70% 50% / 0.3)',
              }}>
                <Radio size={10} /> Live AI
              </span>
            )}
            {isLive === false && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                color: 'hsl(35 90% 60%)', fontSize: 11, fontWeight: 600,
                padding: '1px 8px', borderRadius: 999,
                background: 'hsl(35 90% 55% / 0.12)',
                border: '1px solid hsl(35 90% 55% / 0.3)',
              }}>
                Offline practice
              </span>
            )}
          </div>
        </div>

        {/* Timer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
          padding: isMobile ? '6px 10px' : '6px 14px', borderRadius: 8,
          background: elapsed > 2400
            ? 'hsl(0 85% 60% / 0.12)'
            : 'hsl(215 15% 11%)',
          border: `1px solid ${elapsed > 2400 ? 'hsl(0 85% 60% / 0.35)' : 'hsl(215 15% 18%)'}`,
        }}>
          <Timer size={14} color={elapsed > 2400 ? 'hsl(0 85% 65%)' : 'hsl(210 10% 50%)'} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
            color: elapsed > 2400 ? 'hsl(0 85% 65%)' : 'hsl(210 10% 70%)',
            letterSpacing: '0.05em',
          }}>
            {formatTime(elapsed)}
          </span>
        </div>

        <button
          title="Settings"
          style={{
            background: 'hsl(215 15% 11%)',
            border: '1px solid hsl(215 15% 18%)',
            borderRadius: 8, padding: 0,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            width: isMobile ? 40 : 34, height: isMobile ? 40 : 34, flexShrink: 0,
          }}
        >
          <Settings2 size={16} color="hsl(210 10% 50%)" />
        </button>
      </header>

      {/* ── Main workspace ───────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', overflow: isMobile ? 'visible' : 'hidden',
        flexDirection: isMobile ? 'column' : 'row',
      }}>

        {/* Left: Chat / Problem / Code panels */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0,
          minHeight: isMobile ? '60vh' : 0,
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 0,
            padding: '10px 16px 0',
            background: 'hsl(215 15% 7%)',
            borderBottom: '1px solid hsl(215 15% 13%)',
            flexShrink: 0,
            overflowX: 'auto',
          }}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                  padding: isMobile ? '9px 14px' : '8px 18px', border: 'none',
                  cursor: 'pointer', fontSize: isMobile ? 12.5 : 13, fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                  background: 'transparent',
                  color: activeTab === key ? 'hsl(174 85% 70%)' : 'hsl(210 10% 48%)',
                  borderBottom: activeTab === key
                    ? '2px solid hsl(174 85% 65%)'
                    : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 0.18s',
                  minHeight: 40,
                }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                flex: 1, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {activeTab === 'transcript' && (
                <TranscriptPanel isThinking={isThinking} />
              )}

              {activeTab === 'problem' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '24px 28px' }}>
                  <div style={{
                    maxWidth: 680,
                    color: 'hsl(210 10% 80%)',
                    lineHeight: 1.75, fontSize: 14,
                  }}>
                    {(problem?.statement || '').split('\n').map((line, i) => {
                      if (line.startsWith('## '))
                        return <h2 key={i} style={{ fontSize: 20, fontWeight: 700, color: 'hsl(210 10% 92%)', marginBottom: 12, letterSpacing: '-0.02em' }}>{line.replace('## ', '')}</h2>;
                      if (line.startsWith('**') && line.endsWith('**'))
                        return <p key={i} style={{ fontWeight: 600, color: 'hsl(174 85% 70%)', marginTop: 16, marginBottom: 6 }}>{line.replace(/\*\*/g, '')}</p>;
                      if (line.startsWith('- '))
                        return <li key={i} style={{ marginLeft: 20, marginBottom: 4 }}>{line.slice(2)}</li>;
                      if (line.startsWith('```'))
                        return null;
                      if (line.trim() === '')
                        return <br key={i} />;
                      return <p key={i} style={{ marginBottom: 6 }}>{line}</p>;
                    })}
                    {problem && problem.testCases.length > 0 && (
                      <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 10, background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 50%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                          Hidden test cases ({(generated ? generated.hiddenTestCases.length : problem.testCases.length)})
                        </p>
                        <p style={{ fontSize: 12.5, color: 'hsl(210 10% 62%)', lineHeight: 1.7 }}>
                          Your solution will be checked against {(generated ? generated.hiddenTestCases.length : problem.testCases.length)} test cases when you press Run Tests. Input is read from stdin; output is compared to the expected value.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'code' && (
                <div style={{ flex: 1, padding: '12px', overflow: 'hidden' }}>
                  <CodeWorkspace
                    testCases={problem?.testCases || []}
                    hiddenTestCases={generated ? generated.hiddenTestCases : undefined}
                    expectedComplexity={generated ? generated.expectedComplexity : undefined}
                    sessionId={sessionId}
                    problem={problem ? {
                      id: problem.id,
                      title: problem.title,
                      difficulty: problem.difficulty,
                      tags: problem.tags,
                      statement: problem.statement,
                    } : null}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right: AI avatar + voice sidebar */}
        <aside style={{
          flex: 1,
          borderLeft: isMobile ? 'none' : '1px solid hsl(215 15% 13%)',
          borderTop: isMobile ? '1px solid hsl(215 15% 13%)' : 'none',
          background: 'hsl(215 15% 6%)',
          padding: isMobile ? '16px 16px' : '24px 20px',
          display: 'flex', flexDirection: 'column',
          gap: 18, overflowY: 'auto',
          minHeight: isMobile ? 380 : 0,
          flexShrink: 0,
        }}>
          {/* Avatar + status */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '8px 0',
          }}>
            <AiAvatar
              isSpeaking={isPlayingAudio}
              isListening={isListening}
              size={isMobile ? 130 : 180}
            />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 14px', borderRadius: 999,
              background: 'hsl(215 15% 9%)',
              border: '1px solid hsl(215 15% 16%)',
            }}>
              <motion.span
                animate={{ opacity: isPlayingAudio || isListening || isThinking ? [1, 0.3, 1] : 1 }}
                transition={{ duration: 1.4, repeat: isPlayingAudio || isListening || isThinking ? Infinity : 0, ease: 'easeInOut' }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: voiceState.color }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: voiceState.color, letterSpacing: '0.03em' }}>
                {voiceState.text}
              </span>
            </div>

            {/* Verdict chips */}
            <div style={{ display: 'flex', gap: 8, minHeight: 24 }}>
              {hasTeaching && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 600, color: 'hsl(280 80% 75%)',
                    background: 'hsl(280 70% 60% / 0.15)',
                    border: '1px solid hsl(280 70% 60% / 0.3)',
                    padding: '3px 10px', borderRadius: 999,
                  }}
                >
                  <XCircle size={11} /> Needs coaching
                </motion.div>
              )}
              {interviewComplete && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 600, color: 'hsl(142 70% 60%)',
                    background: 'hsl(142 70% 50% / 0.12)',
                    border: '1px solid hsl(142 70% 50% / 0.3)',
                    padding: '3px 10px', borderRadius: 999,
                  }}
                >
                  <CheckCircle2 size={11} /> Completed
                </motion.div>
              )}
            </div>
          </div>

          <VoiceWidget
            onBargeIn={handleBargeIn}
            onEndSession={handleEndSession}
            onAnswer={handleVoiceAnswer}
          />

          {/* Resume analysis */}
          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                borderRadius: 14,
                background: 'hsl(215 15% 8%)',
                border: '1px solid hsl(215 15% 14%)',
                padding: '16px',
              }}
            >
              <p style={{
                fontSize: 11, fontWeight: 600, color: 'hsl(210 10% 45%)',
                marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Sparkles size={12} color="hsl(174 85% 65%)" /> Resume Analysis
              </p>
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'hsl(210 10% 75%)', marginBottom: 12 }}>
                {analysis.summary}
              </p>
              {analysis.strengths.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(142 70% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Strengths
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {analysis.strengths.map(s => (
                      <span key={s} style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 999,
                        color: 'hsl(142 70% 65%)',
                        background: 'hsl(142 70% 50% / 0.1)',
                        border: '1px solid hsl(142 70% 50% / 0.25)',
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.focusAreas.length > 0 && (
                <div>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(35 90% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Focus Areas
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {analysis.focusAreas.map(s => (
                      <span key={s} style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 999,
                        color: 'hsl(35 90% 65%)',
                        background: 'hsl(35 90% 55% / 0.1)',
                        border: '1px solid hsl(35 90% 55% / 0.25)',
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Quick session info */}
          <div style={{
            borderRadius: 14,
            background: 'hsl(215 15% 8%)',
            border: '1px solid hsl(215 15% 14%)',
            padding: '16px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'hsl(210 10% 45%)', marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Session Info
            </p>
            {[
              { label: 'Role',       value: sessionInfo.role },
              { label: 'Company',    value: sessionInfo.company },
              { label: 'Mode',       value: sessionInfo.mode.replace(/_/g, ' ') },
              { label: 'Gateway',    value: isLive === false ? 'Offline practice' : 'OpenCode Live' },
              { label: 'Questions',  value: String(interviewerTurns) },
              { label: 'Status',     value: interviewComplete ? 'Completed' : 'In progress' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 12, color: 'hsl(210 10% 42%)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'hsl(210 10% 75%)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Feedback summary */}
          {interviewComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                borderRadius: 14,
                background: 'linear-gradient(135deg, hsl(176 40% 45% / 0.14), hsl(174 85% 60% / 0.06))',
                border: '1px solid hsl(174 85% 60% / 0.3)',
                padding: '16px',
              }}
            >
              <p style={{
                fontSize: 11, fontWeight: 600, color: 'hsl(174 85% 70%)',
                marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Sparkles size={12} /> Feedback Report
              </p>
              {feedback ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    <div style={{
                      width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${scoreColor(feedback.score)}1a`,
                      border: `3px solid ${scoreColor(feedback.score)}`,
                      fontSize: 18, fontWeight: 800, color: scoreColor(feedback.score),
                    }}>
                      {feedback.score}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)', marginBottom: 4 }}>
                        Interview complete!
                      </p>
                      <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', lineHeight: 1.5 }}>
                        {feedback.gaps.length} gap{feedback.gaps.length === 1 ? '' : 's'} flagged · {feedback.nextTopics.length} topics to study
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowReport(true)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '10px', borderRadius: 9, cursor: 'pointer',
                      background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                      border: 'none', color: 'hsl(220 15% 5%)',
                      fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <FileText size={14} /> View Full Report
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'hsl(210 10% 55%)', fontSize: 12.5 }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                  >
                    <Sparkles size={13} />
                  </motion.div>
                  Generating your report…
                </div>
              )}
            </motion.div>
          )}
        </aside>
      </div>

      {/* ── Full report modal ─────────────────────────── */}
      <AnimatePresence>
        {showReport && feedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'hsl(220 15% 3% / 0.7)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: isMobile ? '12px' : '24px',
            }}
            onClick={() => setShowReport(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 720, maxHeight: '88vh',
                overflowY: 'auto', borderRadius: 20,
                background: 'hsl(215 15% 8%)',
                border: '1px solid hsl(215 15% 18%)',
                padding: isMobile ? '20px 16px' : '28px 32px',
                boxShadow: '0 24px 80px hsl(220 15% 3% / 0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                    Interview Feedback
                  </h2>
                  <p style={{ fontSize: 13, color: 'hsl(210 10% 50%)' }}>
                    {sessionInfo.role} · {sessionInfo.company} · {sessionInfo.mode.replace(/_/g, ' ')}
                  </p>
                </div>
                <button
                  onClick={() => setShowReport(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                  <X size={18} color="hsl(210 10% 50%)" />
                </button>
              </div>

              {/* Overall score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24, flexWrap: isNarrow ? 'wrap' : 'nowrap', justifyContent: isNarrow ? 'center' : 'flex-start', textAlign: isNarrow ? 'center' : 'left' }}>
                <div style={{
                  width: isMobile ? 72 : 84, height: isMobile ? 72 : 84, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${scoreColor(feedback.score)}1a`,
                  border: `4px solid ${scoreColor(feedback.score)}`,
                  fontSize: isMobile ? 22 : 26, fontWeight: 800, color: scoreColor(feedback.score),
                }}>
                  {feedback.score}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, color: 'hsl(210 10% 82%)', lineHeight: 1.65 }}>
                    {feedback.summary}
                  </p>
                </div>
              </div>

              {/* Breakdown */}
              {(() => {
                const dims = (feedback.dimensions && feedback.dimensions.length ? feedback.dimensions : feedback.breakdown) || [];
                if (dims.length === 0) return null;
                return (
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
                      Score Breakdown
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      {dims.map(({ label, value }) => (
                        <div key={label} style={{
                          padding: '12px 14px', borderRadius: 12,
                          background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: 'hsl(210 10% 65%)' }}>{label}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'hsl(210 10% 80%)' }}>{value}%</span>
                          </div>
                          <div style={{ height: 7, borderRadius: 999, background: 'hsl(215 15% 14%)', overflow: 'hidden' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${value}%` }}
                              transition={{ duration: 0.8, delay: 0.1 }}
                              style={{
                                height: '100%', borderRadius: 999,
                                background: value >= 85
                                  ? 'linear-gradient(90deg, hsl(142 70% 45%), hsl(142 70% 60%))'
                                  : value >= 70
                                    ? 'linear-gradient(90deg, hsl(35 90% 45%), hsl(35 90% 60%))'
                                    : 'linear-gradient(90deg, hsl(0 85% 55%), hsl(0 85% 70%))',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Coding performance */}
              {feedback.codingPerformance && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(215 80% 65%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
                    <Code2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Coding Performance
                  </p>
                  <div style={{
                    padding: '14px 16px', borderRadius: 12,
                    background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)',
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 82%)' }}>
                        {feedback.codingPerformance.problemTitle || 'Coding exercise'}
                      </span>
                      {feedback.codingPerformance.language && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          color: 'hsl(215 80% 70%)', background: 'hsl(215 80% 60% / 0.12)',
                          border: '1px solid hsl(215 80% 60% / 0.25)',
                        }}>{feedback.codingPerformance.language}</span>
                      )}
                      {feedback.codingPerformance.status && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          color: feedback.codingPerformance.status === 'ACCEPTED' ? 'hsl(142 70% 60%)' : 'hsl(0 85% 60%)',
                          background: feedback.codingPerformance.status === 'ACCEPTED'
                            ? 'hsl(142 70% 50% / 0.12)'
                            : 'hsl(0 85% 55% / 0.12)',
                          border: '1px solid ' + (feedback.codingPerformance.status === 'ACCEPTED'
                            ? 'hsl(142 70% 50% / 0.3)'
                            : 'hsl(0 85% 55% / 0.3)'),
                        }}>
                          {feedback.codingPerformance.status === 'ACCEPTED'
                            ? `${feedback.codingPerformance.passedCount ?? '—'}/${feedback.codingPerformance.totalCount ?? '—'} passed`
                            : feedback.codingPerformance.status}
                        </span>
                      )}
                      {feedback.codingPerformance.timeMs != null && (
                        <span style={{ fontSize: 11, color: 'hsl(210 10% 55%)' }}>
                          {feedback.codingPerformance.timeMs.toFixed(1)}ms
                        </span>
                      )}
                      {feedback.codingPerformance.verified === false && (
                        <span style={{ fontSize: 11, color: 'hsl(48 95% 60%)', fontStyle: 'italic' }}>
                          Judge offline — result not verified
                        </span>
                      )}
                    </div>

                    {feedback.codingPerformance.strengths.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(142 70% 60%)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                          What went well
                        </p>
                        {feedback.codingPerformance.strengths.map((s, i) => (
                          <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6 }}>• {s}</p>
                        ))}
                      </div>
                    )}

                    {feedback.codingPerformance.weaknesses.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(0 85% 60%)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                          Where to improve
                        </p>
                        {feedback.codingPerformance.weaknesses.map((s, i) => (
                          <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6 }}>• {s}</p>
                        ))}
                      </div>
                    )}

                    {feedback.codingPerformance.complexity && (
                      <p style={{ fontSize: 12, color: 'hsl(210 10% 60%)', marginBottom: 10 }}>
                        <span style={{ color: 'hsl(210 10% 50%)' }}>Complexity: </span>{feedback.codingPerformance.complexity}
                      </p>
                    )}

                    {feedback.codingPerformance.recommendation.length > 0 && (
                      <div>
                        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(215 80% 65%)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
                          Recommendation
                        </p>
                        {feedback.codingPerformance.recommendation.map((s, i) => (
                          <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6 }}>• {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {feedback.strengths.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(142 70% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Strengths
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {feedback.strengths.map(s => (
                      <span key={s} style={{
                        fontSize: 12, padding: '5px 12px', borderRadius: 999,
                        color: 'hsl(142 70% 65%)',
                        background: 'hsl(142 70% 50% / 0.1)',
                        border: '1px solid hsl(142 70% 50% / 0.25)',
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strong answers */}
              {feedback.strongAnswers && feedback.strongAnswers.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(142 70% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Strong Answers
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.strongAnswers.map((a, i) => (
                      <div key={i} style={{
                        padding: '11px 13px', borderRadius: 10,
                        background: 'hsl(215 15% 9%)',
                        border: '1px solid hsl(142 70% 50% / 0.22)',
                        borderLeft: '3px solid hsl(142 70% 55%)',
                      }}>
                        <p style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.55 }}>{a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {feedback.gaps.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(0 85% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Detected Gaps
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.gaps.map(g => (
                      <div key={g.topic} style={{
                        padding: '11px 13px', borderRadius: 10,
                        background: 'hsl(215 15% 9%)',
                        border: `1px solid ${severityColor[g.severity]}35`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 82%)' }}>{g.topic}</span>
                          <span style={{
                            marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
                            padding: '2px 8px', borderRadius: 999,
                            color: severityColor[g.severity],
                            background: `${severityColor[g.severity]}1c`,
                          }}>
                            {g.severity}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', lineHeight: 1.55 }}>{g.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weak answers */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(0 85% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                  <XCircle size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Weak Answers
                </p>
                {feedback.weakAnswers && feedback.weakAnswers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.weakAnswers.map((a, i) => (
                      <div key={i} style={{
                        padding: '11px 13px', borderRadius: 10,
                        background: 'hsl(215 15% 9%)',
                        border: '1px solid hsl(0 85% 55% / 0.22)',
                        borderLeft: '3px solid hsl(0 85% 60%)',
                      }}>
                        <p style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{a}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', fontStyle: 'italic' }}>No notably weak answers were detected.</p>
                )}
              </div>

              {/* Better answer */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(174 85% 65%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                  <Sparkles size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Better Answer
                </p>
                {feedback.betterAnswer ? (
                  <div style={{
                    padding: '13px 15px', borderRadius: 12,
                    background: 'linear-gradient(135deg, hsl(174 85% 60% / 0.08), hsl(176 40% 45% / 0.06))',
                    border: '1px solid hsl(174 85% 60% / 0.3)',
                  }}>
                    <p style={{ fontSize: 12.5, color: 'hsl(174 85% 80%)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{feedback.betterAnswer}</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', fontStyle: 'italic' }}>No rewritten answer available for this session.</p>
                )}
              </div>

              {/* Tips */}
              {feedback.tips.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(35 90% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Tips
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.tips.map((t, i) => (
                      <p key={i} style={{
                        fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6,
                        paddingLeft: 12, borderLeft: '2px solid hsl(35 90% 55% / 0.45)',
                      }}>
                        {t}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended coding practice */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(320 75% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                  <Code2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Coding Practice
                </p>
                {feedback.recommendedCodingPractice && feedback.recommendedCodingPractice.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.recommendedCodingPractice.map((r, i) => (
                      <p key={i} style={{
                        fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6,
                        paddingLeft: 12, borderLeft: '2px solid hsl(320 75% 55% / 0.45)',
                      }}>
                        {r}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', fontStyle: 'italic' }}>No coding-specific weaknesses were detected in this session.</p>
                )}
              </div>

              {/* Recommended interview questions */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(215 80% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                  <MessageSquare size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Interview Questions to Practice
                </p>
                {feedback.recommendedInterviewQuestions && feedback.recommendedInterviewQuestions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {feedback.recommendedInterviewQuestions.map((r, i) => (
                      <p key={i} style={{
                        fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.6,
                        paddingLeft: 12, borderLeft: '2px solid hsl(215 80% 55% / 0.45)',
                      }}>
                        {r}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 55%)', fontStyle: 'italic' }}>No recommended interview questions for this session.</p>
                )}
              </div>

              {/* Next topics */}
              {feedback.nextTopics.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(174 85% 65%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Study Next
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {feedback.nextTopics.map(t => (
                      <span key={t} style={{
                        fontSize: 12, padding: '5px 12px', borderRadius: 999,
                        color: 'hsl(174 85% 70%)',
                        background: 'hsl(174 85% 60% / 0.1)',
                        border: '1px solid hsl(174 85% 60% / 0.25)',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Context used */}
              {feedback.contextUsed && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Context Used
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <ContextChip ok={feedback.contextUsed.resume} label={feedback.contextUsed.resume ? 'Resume' : 'No resume provided'} />
                    <ContextChip ok={feedback.contextUsed.jd} label={feedback.contextUsed.jd ? 'Job description' : 'No job description'} />
                    <ContextChip ok={feedback.contextUsed.skills.length > 0} label={feedback.contextUsed.skills.length > 0 ? `${feedback.contextUsed.skills.length} skills` : 'No skills listed'} />
                    <ContextChip ok={feedback.contextUsed.github} label={feedback.contextUsed.github ? 'GitHub' : 'No GitHub repository'} />
                    {feedback.contextUsed.difficulty && (
                      <ContextChip ok label={`Difficulty: ${feedback.contextUsed.difficulty}`} />
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                <button
                  onClick={() => navigate('/dashboard/history')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                    background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                    border: 'none', color: 'hsl(220 15% 5%)',
                    fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
                  }}
                >
                  View in History
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContextChip({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? 'hsl(142 70% 55%)' : 'hsl(0 85% 55%)';
  const bg = ok ? 'hsl(142 70% 50% / 0.1)' : 'hsl(0 85% 55% / 0.1)';
  const border = ok ? 'hsl(142 70% 50% / 0.25)' : 'hsl(0 85% 55% / 0.25)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 600,
      padding: '5px 11px', borderRadius: 999,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      <span style={{ fontSize: 10 }}>{ok ? '✓' : '—'}</span>
      {label}
    </span>
  );
}
