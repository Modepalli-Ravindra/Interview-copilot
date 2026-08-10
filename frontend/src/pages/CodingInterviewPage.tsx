import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Code2, Brain, Lightbulb, ArrowRight, CheckCircle2, XCircle, Loader2,
  Target, Trophy, ChevronRight, UserRound, FileText, RefreshCw, Play,
  ShieldAlert, X, Timer,
} from 'lucide-react';
import CodeWorkspace from '../components/interview/CodeWorkspace';
import { useInterviewStore } from '../stores/interviewStore';
import { apiFetch } from '../lib/api';
import {
  startCodingInterview, getCodingInterviewStatus, requestCodingHint,
  completeCodingQuestion, nextCodingQuestion, getCodingInterviewFeedback,
} from '../lib/codingInterviewApi';
import type {
  PublicCodingQuestion, CodingInterviewStatus, FeedbackReport,
  CodingInterviewReport,
} from '../types';

type Difficulty = 'Easy' | 'Medium' | 'Hard';

const diffColor: Record<Difficulty, string> = {
  Easy:   'hsl(142 70% 50%)',
  Medium: 'hsl(35 90% 55%)',
  Hard:   'hsl(0 85% 60%)',
};

const diffBg: Record<Difficulty, string> = {
  Easy:   'hsl(142 70% 50% / 0.12)',
  Medium: 'hsl(35 90% 55% / 0.12)',
  Hard:   'hsl(0 85% 60% / 0.12)',
};

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 9, border: '1px solid hsl(215 15% 20%)',
  background: 'hsl(215 15% 5%)', color: 'hsl(210 10% 85%)',
  fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
};

const templateFor = (q: PublicCodingQuestion): string =>
  `# ${q.title}\n# ${q.expectedComplexity || ''}\ndef solution():\n    pass\n`;

export default function CodingInterviewPage() {
  const navigate = useNavigate();
  const { sessionId: paramSessionId } = useParams();
  const { setEditorLanguage, updateCode } = useInterviewStore();

  const [sessionId, setSessionId] = useState<string | null>(paramSessionId || null);
  const [status, setStatus] = useState<CodingInterviewStatus | null>(null);
  const [question, setQuestion] = useState<PublicCodingQuestion | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [allPassed, setAllPassed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: FeedbackReport; codingInterview: CodingInterviewReport } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [role, setRole] = useState('Software Engineer');
  const [company, setCompany] = useState('InterviewPilot');
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [skills, setSkills] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [startDifficulty, setStartDifficulty] = useState<Difficulty>('Medium');
  const [resumeSessionId, setResumeSessionId] = useState('');

  const applyQuestion = useCallback((q: PublicCodingQuestion) => {
    setQuestion(q);
    setHint(null);
    setAllPassed(false);
    setEditorLanguage(q.language);
    updateCode(templateFor(q));
  }, [setEditorLanguage, updateCode]);

  const finishReport = useCallback(async (id: string) => {
    setReportLoading(true);
    setError(null);
    try {
      const fb = await getCodingInterviewFeedback(id);
      setReport(fb);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCodingInterviewStatus(id);
      if (!data.status) {
        setStatus(null);
        setQuestion(null);
        return;
      }
      setStatus(data.status);
      if (data.status.completed && !data.question) {
        await finishReport(id);
        return;
      }
      if (data.question) applyQuestion(data.question);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [applyQuestion, finishReport]);

  useEffect(() => {
    if (paramSessionId) {
      setSessionId(paramSessionId);
      loadSession(paramSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSessionId]);

  const beginInterview = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await startCodingInterview({
        sessionId: id,
        questionCount,
        startDifficulty,
        language: 'python',
      });
      setStatus(data.status);
      if (data.finished || !data.question) {
        await finishReport(id);
        return;
      }
      applyQuestion(data.question);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [applyQuestion, finishReport, questionCount, startDifficulty]);

  const createAndStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'CODING_INTERVIEW',
          role,
          company,
          resumeText: resumeText.trim() || undefined,
          jdText: jdText.trim() || undefined,
          skills: skills.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20),
          difficulty: startDifficulty,
        }),
      });
      const json = await res.json();
      if (!json.success || !json.data?.id) {
        setError(json.error || 'Failed to create the session');
        return;
      }
      const id = json.data.id as string;
      setSessionId(id);
      navigate(`/coding-interview/${id}`, { replace: true });
      await beginInterview(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRequestHint = async () => {
    if (!sessionId || !question) return;
    setBusy(true);
    setError(null);
    try {
      const data = await requestCodingHint(sessionId, question.questionId);
      setHint(data.hint);
      setStatus(prev => prev ? {
        ...prev,
        questions: prev.questions.map(q =>
          q.questionId === question.questionId ? { ...q, hintsUsed: data.hintsUsed } : q,
        ),
      } : prev);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      let st = status;
      if (question && !question.completed) {
        const done = await completeCodingQuestion(sessionId);
        st = done.status;
        if (done.finished) {
          setStatus(st);
          setQuestion(null);
          setHint(null);
          await finishReport(sessionId);
          return;
        }
      }
      const data = await nextCodingQuestion(sessionId, 'python');
      setStatus(data.status);
      if (data.finished || !data.question) {
        setQuestion(null);
        setHint(null);
        await finishReport(sessionId);
        return;
      }
      applyQuestion(data.question);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const questionList = status?.questions || [];
  const currentQuestionId = status?.currentQuestionId || question?.questionId;
  const activeQuestion = question;

  // ── Setup view ─────────────────────────────────────────────
  if (!sessionId || (!status && !loading && !report && !busy)) {
    return (
      <motion.div {...fadePage} style={{ minHeight: '100vh', maxWidth: 860, margin: '0 auto', paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'hsl(176 40% 45% / 0.15)',
            border: '1px solid hsl(176 40% 45% / 0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={20} color="hsl(174 85% 65%)" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em', margin: 0 }}>
              Adaptive Coding Interview
            </h1>
            <p style={{ fontSize: 13, color: 'hsl(210 10% 50%)', margin: '2px 0 0' }}>
              Questions grounded in your resume &amp; JD — difficulty adapts from verified execution results.
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: 14, padding: '12px 16px', borderRadius: 12,
            background: 'hsl(0 85% 60% / 0.1)', border: '1px solid hsl(0 85% 60% / 0.3)',
            color: 'hsl(0 85% 65%)', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{
          background: 'hsl(215 15% 8%)',
          border: '1px solid hsl(215 15% 14%)',
          borderRadius: 16, padding: '22px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <UserRound size={15} color="hsl(174 85% 65%)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>New interview</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Role
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Company
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Acme" style={inputStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Resume text <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
              <textarea
                value={resumeText}
                onChange={e => setResumeText(e.target.value)}
                rows={4}
                placeholder="Paste your resume — questions will be grounded in it"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </label>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Job description <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
              <textarea
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                rows={4}
                placeholder="Paste the JD — question topics will target required skills"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </label>
          </div>

          <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            Skills <span style={{ fontWeight: 400, opacity: 0.7 }}>(comma-separated, optional)</span>
            <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="python, system design, sql" style={inputStyle} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Number of questions
              <select value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} style={inputStyle}>
                {[3, 5, 7].map(n => <option key={n} value={n}>{n} questions</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 55%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Starting difficulty
              <select value={startDifficulty} onChange={e => setStartDifficulty(e.target.value as Difficulty)} style={inputStyle}>
                {(['Easy', 'Medium', 'Hard'] as const).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          <motion.button
            whileHover={{ scale: busy ? 1 : 1.02 }}
            whileTap={{ scale: busy ? 1 : 0.98 }}
            onClick={createAndStart}
            disabled={busy || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              width: '100%', padding: '11px 0', borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, hsl(176 40% 42%), hsl(174 85% 55%))',
              border: 'none', color: 'hsl(220 15% 5%)',
              fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
            }}
          >
            {busy || loading ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
            {busy || loading ? 'Starting…' : 'Start Interview'}
          </motion.button>
        </div>

        <div style={{
          marginTop: 14, padding: '18px 24px', borderRadius: 16,
          background: 'hsl(215 15% 8%)',
          border: '1px solid hsl(215 15% 14%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <RefreshCw size={15} color="hsl(174 85% 65%)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>Resume an existing interview</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={resumeSessionId}
              onChange={e => setResumeSessionId(e.target.value)}
              placeholder="Paste a session id"
              style={inputStyle}
            />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => resumeSessionId.trim() && beginInterview(resumeSessionId.trim())}
              disabled={!resumeSessionId.trim() || loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px', borderRadius: 10,
                cursor: resumeSessionId.trim() && !loading ? 'pointer' : 'not-allowed',
                background: 'hsl(215 15% 14%)',
                border: '1px solid hsl(215 15% 22%)',
                color: 'hsl(174 85% 70%)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}
            >
              {loading ? <Loader2 size={13} className="spin" /> : <ArrowRight size={13} />}
              Resume
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (loading || (busy && !activeQuestion && !report)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'hsl(210 10% 50%)' }}>
        <Loader2 size={26} className="spin" />
        <span style={{ fontSize: 13 }}>Loading coding interview…</span>
      </div>
    );
  }

  const statementLines = (activeQuestion?.problemStatement || '').split('\n');

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em', margin: 0 }}>
              Coding Interview
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              color: diffColor[status?.currentDifficulty || 'Medium'],
              background: diffBg[status?.currentDifficulty || 'Medium'],
            }}>
              {status?.currentDifficulty || 'Medium'}
            </span>
            <QuestionTimer startedAt={activeQuestion?.startedAt ?? null} />
          </div>
          <p style={{ fontSize: 12.5, color: 'hsl(210 10% 50%)', margin: 0 }}>
            Question {status?.questionNumber || questionList.length} of {status?.targetQuestionCount || questionList.length} · adaptive difficulty · hidden tests stay server-side
          </p>
        </div>
        <button
          onClick={() => sessionId && finishReport(sessionId)}
          disabled={reportLoading}
          style={{
            padding: '8px 14px', borderRadius: 10, cursor: reportLoading ? 'wait' : 'pointer',
            background: 'hsl(0 85% 60% / 0.1)',
            border: '1px solid hsl(0 85% 60% / 0.3)',
            color: 'hsl(0 85% 65%)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
          }}
        >
          {reportLoading ? 'Generating…' : 'Finish & View Report'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {questionList.map((q, i) => {
          const isActive = q.questionId === currentQuestionId;
          const done = q.status === 'completed';
          const passed = done && q.totalCount > 0 && q.passedCount === q.totalCount;
          const Icon = done ? (passed ? CheckCircle2 : XCircle) : isActive ? ChevronRight : ChevronRight;
          const color = done ? (passed ? 'hsl(142 70% 55%)' : 'hsl(0 85% 60%)') : isActive ? 'hsl(174 85% 65%)' : 'hsl(215 15% 30%)';
          return (
            <motion.div
              key={q.questionId}
              whileHover={{ y: -1 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 12px', borderRadius: 999,
                background: done ? 'hsl(215 15% 10%)' : isActive ? 'hsl(176 40% 45% / 0.12)' : 'hsl(215 15% 7%)',
                border: `1px solid ${isActive ? 'hsl(174 85% 60% / 0.35)' : 'hsl(215 15% 14%)'}`,
                fontSize: 12, color: 'hsl(210 10% 70%)',
              }}
            >
              <Icon size={12} color={color} />
              <span style={{ fontWeight: 600 }}>Q{i + 1}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{q.topic}</span>
              {q.fromMock && <span style={{ fontSize: 10, opacity: 0.55 }}>(template)</span>}
            </motion.div>
          );
        })}
        {status?.completed && !activeQuestion && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(142 70% 55%)' }}>
            <Trophy size={13} /> Interview complete
          </span>
        )}
      </div>

      {error && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 12,
          background: 'hsl(0 85% 60% / 0.1)', border: '1px solid hsl(0 85% 60% / 0.3)',
          color: 'hsl(0 85% 65%)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {allPassed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 14, padding: '11px 16px', borderRadius: 12,
          background: 'hsl(142 70% 50% / 0.1)', border: '1px solid hsl(142 70% 50% / 0.3)',
          color: 'hsl(142 70% 60%)', fontSize: 13, fontWeight: 600,
        }}>
          <CheckCircle2 size={15} /> All tests passed — complete the question to move on.
        </div>
      )}

      {!activeQuestion ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          padding: '60px 24px', borderRadius: 16,
          background: 'hsl(215 15% 8%)', border: '1px solid hsl(215 15% 14%)',
        }}>
          <Trophy size={30} color="hsl(35 90% 55%)" />
          <h2 style={{ fontSize: 18, color: 'hsl(210 10% 90%)', margin: 0 }}>Interview complete</h2>
          <p style={{ fontSize: 13, color: 'hsl(210 10% 50%)', margin: 0 }}>
            {questionList.length}/{questionList.length} questions finished. Generate your end-of-interview report.
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => sessionId && finishReport(sessionId)}
            disabled={reportLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 22px', borderRadius: 10, cursor: reportLoading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, hsl(176 40% 42%), hsl(174 85% 55%))',
              border: 'none', color: 'hsl(220 15% 5%)',
              fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
            }}
          >
            {reportLoading ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}
            {reportLoading ? 'Generating report…' : 'View Report'}
          </motion.button>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(380px, 42%) 1fr', gap: 16,
          height: 'calc(100vh - 210px)', minHeight: 460,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', minHeight: 0,
            background: 'hsl(215 15% 8%)',
            border: '1px solid hsl(215 15% 14%)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid hsl(215 15% 13%)',
              overflowY: 'auto', flex: 1, minHeight: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: 'hsl(176 40% 45% / 0.15)',
                  border: '1px solid hsl(176 40% 45% / 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Code2 size={15} color="hsl(174 85% 65%)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 90%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeQuestion.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
                      color: diffColor[activeQuestion.difficulty],
                      background: diffBg[activeQuestion.difficulty],
                    }}>
                      {activeQuestion.difficulty}
                    </span>
                    <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                      {activeQuestion.topic} · {activeQuestion.hiddenTestCount} hidden tests · {activeQuestion.attemptsCount} attempt{activeQuestion.attemptsCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ color: 'hsl(210 10% 78%)', lineHeight: 1.7, fontSize: 13.5 }}>
                {statementLines.map((line, i) => {
                  if (line.startsWith('## '))
                    return <h3 key={i} style={{ fontSize: 15, fontWeight: 700, color: 'hsl(210 10% 92%)', marginBottom: 8, marginTop: 10 }}>{line.replace('## ', '')}</h3>;
                  if (line.startsWith('**') && line.endsWith('**'))
                    return <p key={i} style={{ fontWeight: 600, color: 'hsl(174 85% 70%)', marginTop: 10, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</p>;
                  if (line.startsWith('- '))
                    return <p key={i} style={{ marginLeft: 16, marginBottom: 3, display: 'flex', gap: 8 }}><Target size={12} color="hsl(174 85% 60%)" style={{ marginTop: 4, flexShrink: 0 }} /> {line.slice(2)}</p>;
                  if (line.trim() === '')
                    return <br key={i} />;
                  return <p key={i} style={{ marginBottom: 5 }}>{line}</p>;
                })}
                {activeQuestion.examples?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 60%)', marginBottom: 6 }}>Examples</div>
                    {activeQuestion.examples.map((ex, i) => (
                      <div key={i} style={{
                        background: 'hsl(215 15% 5%)', border: '1px solid hsl(215 15% 12%)',
                        borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12,
                        fontFamily: 'var(--font-mono)', color: 'hsl(210 10% 70%)',
                      }}>
                        <div>Input: {ex.input}</div>
                        <div>Output: {ex.output}</div>
                        {ex.explanation && <div style={{ color: 'hsl(210 10% 50%)' }}>{ex.explanation}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{
              padding: '12px 20px', borderTop: '1px solid hsl(215 15% 13%)',
              background: 'hsl(215 15% 7%)',
            }}>
              <button
                onClick={onRequestHint}
                disabled={busy || (activeQuestion.hintsUsed >= (activeQuestion.hintsAvailable || 2))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 9, cursor: busy || activeQuestion.hintsUsed >= (activeQuestion.hintsAvailable || 2) ? 'not-allowed' : 'pointer',
                  background: 'hsl(35 90% 55% / 0.12)',
                  border: '1px solid hsl(35 90% 55% / 0.3)',
                  color: 'hsl(35 90% 65%)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  width: '100%', justifyContent: 'center',
                }}
              >
                <Lightbulb size={14} />
                {busy ? 'Working…' : `Request Hint (${activeQuestion.hintsUsed}/${activeQuestion.hintsAvailable || 2})`}
              </button>

              {hint && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 10, padding: '10px 14px', borderRadius: 10,
                    background: 'hsl(35 90% 55% / 0.07)',
                    border: '1px solid hsl(35 90% 55% / 0.2)',
                    color: 'hsl(35 90% 80%)', fontSize: 12.5, lineHeight: 1.6,
                  }}
                >
                  <span style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>Hint</span>
                  {hint}
                </motion.div>
              )}

              <motion.button
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: busy ? 1 : 0.98 }}
                onClick={advance}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                  marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 9, cursor: busy ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg, hsl(176 40% 42%), hsl(174 85% 55%))',
                  border: 'none', color: 'hsl(220 15% 5%)',
                  fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-sans)',
                }}
              >
                {busy ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                {busy ? 'Processing…' : 'Complete & Next Question'}
              </motion.button>
            </div>
          </div>

          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <CodeWorkspace
              testCases={activeQuestion.visibleTestCases || []}
              expectedComplexity={activeQuestion.expectedComplexity}
              codingInterview={{ sessionId, questionId: activeQuestion.questionId }}
              onAccepted={() => setAllPassed(true)}
            />
          </div>
        </div>
      )}

      {report && (
        <ReportModal
          report={report.report}
          coding={report.codingInterview}
          onClose={() => setReport(null)}
        />
      )}
    </motion.div>
  );
}

function ReportModal({ report, coding, onClose }: {
  report: FeedbackReport;
  coding: CodingInterviewReport;
  onClose: () => void;
}) {
  const m = coding.metrics;
  const verified = coding.hasVerifiedExecution;
  const sourceColor = report.feedbackSource === 'ai'
    ? 'hsl(174 85% 65%)'
    : report.feedbackSource === 'fallback'
      ? 'hsl(35 90% 55%)'
      : 'hsl(280 70% 65%)';
  const sourceLabel = report.feedbackSource === 'ai'
    ? 'AI-generated report'
    : report.feedbackSource === 'fallback'
      ? 'Derived report (AI output unavailable)'
      : 'Offline report (no AI provider)';

  const scoreColor = m.overallScore >= 80 ? 'hsl(142 70% 50%)' : m.overallScore >= 60 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';
  const fmt = (ms: number | null) => (ms == null ? '�' : ms >= 60000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 1000)}s`);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'hsl(220 15% 3% / 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, overflowY: 'auto',
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          background: 'hsl(215 15% 7%)',
          border: '1px solid hsl(215 15% 16%)',
          borderRadius: 18, maxWidth: 760, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 80px hsl(220 15% 2% / 0.8)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid hsl(215 15% 14%)',
          position: 'sticky', top: 0, background: 'hsl(215 15% 7%)', zIndex: 2,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Trophy size={18} color="hsl(35 90% 55%)" />
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'hsl(210 10% 92%)', margin: 0 }}>
                Interview Report
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
                color: sourceColor,
                background: `${sourceColor}22`,
                border: `1px solid ${sourceColor}55`,
              }}>
                {sourceLabel}
              </span>
              {!verified && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
                  color: 'hsl(35 90% 55%)',
                  background: 'hsl(35 90% 55% / 0.12)',
                  border: '1px solid hsl(35 90% 55% / 0.35)',
                }}>
                  <ShieldAlert size={11} /> UNVERIFIED � no judge was reachable
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close report" style={{
            background: 'hsl(215 15% 12%)', border: '1px solid hsl(215 15% 20%)',
            borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(210 10% 60%)',
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <p style={{ color: 'hsl(210 10% 75%)', lineHeight: 1.6, fontSize: 13.5, marginTop: 0 }}>{report.summary}</p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', borderRadius: 14, marginBottom: 16,
            background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 14%)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{m.overallScore}</div>
              <div style={{ fontSize: 11, color: 'hsl(210 10% 50%)', marginTop: 4 }}>Overall score</div>
              <div style={{ fontSize: 9.5, color: 'hsl(210 10% 42%)', marginTop: 1 }}>server-derived</div>
            </div>
            <div style={{ width: 1, height: 46, background: 'hsl(215 15% 14%)' }} />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Metric label={verified ? 'Tests passed' : 'Tests (unverified)'} value={verified ? `${m.totalTestsPassed}/${m.totalTests}` : `${m.questionsAttempted} attempted`} />
              <Metric label="Solved" value={`${m.questionsSolved}/${m.questionsAttempted}`} />
              <Metric label="Avg attempts" value={String(m.averageAttempts)} />
            </div>
          </div>

          {verified && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 60%)', marginBottom: 8 }}>
                Hidden test performance
              </div>
              <div style={{
                height: 10, borderRadius: 999, overflow: 'hidden',
                background: 'hsl(215 15% 12%)',
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${m.hiddenTests ? (m.hiddenTestsPassed / m.hiddenTests) * 100 : 0}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, hsl(176 40% 42%), hsl(174 85% 55%))' }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'hsl(210 10% 50%)', marginTop: 5 }}>
                {m.hiddenTestsPassed}/{m.hiddenTests} hidden tests passed
              </div>
            </div>
          )}

          {coding.questions.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 60%)', marginBottom: 8 }}>
                Per-question breakdown
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {coding.questions.map((q) => {
                  const cls = q.classification;
                  const clsColor = cls === 'STRONG' ? 'hsl(142 70% 55%)'
                    : cls === 'STABLE' ? 'hsl(174 85% 65%)'
                    : cls === 'NEEDS_IMPROVEMENT' ? 'hsl(35 90% 55%)'
                    : 'hsl(210 10% 50%)';
                  return (
                    <div key={q.questionId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 10,
                      background: 'hsl(215 15% 8%)', border: '1px solid hsl(215 15% 13%)',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                        color: diffColor[q.difficulty], background: diffBg[q.difficulty],
                        flexShrink: 0,
                      }}>
                        {q.difficulty}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'hsl(210 10% 82%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.title}
                      </span>
                      {q.fromMock ? (
                        <span style={{ fontSize: 10.5, color: 'hsl(210 10% 45%)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                          <ShieldAlert size={10} /> unverified
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: q.passedCount === q.totalCount ? 'hsl(142 70% 55%)' : 'hsl(35 90% 55%)', flexShrink: 0 }}>
                          {q.passedCount}/{q.totalCount}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)', flexShrink: 0 }}>
                        {q.attempts} run{q.attempts === 1 ? '' : 's'} � {fmt(q.timeTakenMs)}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                        color: clsColor, background: `${clsColor}1c`, flexShrink: 0,
                      }}>
                        {cls}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <TopicCard title="Mastered" color="hsl(142 70% 55%)" items={m.masteredTopics} fallback="No verified mastery yet" />
            <TopicCard title="Practice next" color="hsl(35 90% 55%)" items={m.practiceTopics} fallback="No flagged topics" />
          </div>

          {report.tips.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 60%)', marginBottom: 8 }}>Tips</div>
              {report.tips.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'hsl(210 10% 75%)', marginBottom: 5 }}>
                  <ChevronRight size={13} color="hsl(174 85% 65%)" style={{ flexShrink: 0, marginTop: 2 }} />
                  {t}
                </div>
              ))}
            </div>
          )}

          <button onClick={onClose} style={{
            width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            background: 'hsl(215 15% 12%)', border: '1px solid hsl(215 15% 20%)',
            color: 'hsl(210 10% 70%)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
          }}>
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** Live per-question timer, anchored to the server-stamped `startedAt` so it
 *  survives a refresh. Hidden from the header until a question is active. */
function QuestionTimer({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const label = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const warn = total > 40 * 60;
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
      color: warn ? 'hsl(0 85% 65%)' : 'hsl(210 10% 55%)',
      background: warn ? 'hsl(0 85% 60% / 0.1)' : 'hsl(215 15% 12%)',
      border: `1px solid ${warn ? 'hsl(0 85% 60% / 0.35)' : 'hsl(215 15% 20%)'}`,
    }}>
      <Timer size={12} />
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'hsl(210 10% 90%)' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'hsl(210 10% 50%)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TopicCard({ title, color, items, fallback }: { title: string; color: string; items: string[]; fallback: string }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'hsl(215 15% 8%)', border: '1px solid hsl(215 15% 13%)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>{fallback}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.slice(0, 6).map((t) => (
            <span key={t} style={{
              fontSize: 11, padding: '3px 9px', borderRadius: 999,
              color, background: `${color}1c`, border: `1px solid ${color}33`,
            }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
