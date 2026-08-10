import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Circle, Flame, Code2,
  Award, Target, Clock, Loader2, Sparkles, Brain, ArrowRight,
} from 'lucide-react';
import CodeWorkspace from '../components/interview/CodeWorkspace';
import { useInterviewStore } from '../stores/interviewStore';
import { apiFetch } from '../lib/api';
import type { Problem, GeneratedQuestion } from '../types';

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

const SOLVED_KEY = 'interviewpilot_solved_problems';

export default function CodingPage() {
  const navigate = useNavigate();
  const { updateCode, setEditorLanguage } = useInterviewStore();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | Difficulty>('ALL');
  const [generated, setGenerated] = useState<GeneratedQuestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solved, setSolved] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SOLVED_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/problems');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setProblems(json.data);
          setSelectedId(json.data[0]?.id || null);
        }
      } catch (err) {
        console.error('[Coding] problems load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const buildGeneratedStatement = (q: GeneratedQuestion): string => {
    const lines: string[] = [q.problemStatement];
    if (q.constraints.length) lines.push('', '## Constraints', ...q.constraints.map(c => `- ${c}`));
    if (q.inputFormat) lines.push('', '## Input Format', q.inputFormat);
    if (q.outputFormat) lines.push('', '## Output Format', q.outputFormat);
    if (q.examples.length) {
      lines.push('', '## Examples');
      for (const ex of q.examples) {
        lines.push(`**Input:**`, `\`${ex.input}\``, `**Output:**`, `\`${ex.output}\``);
        if (ex.explanation) lines.push(`- Explanation: ${ex.explanation}`);
        lines.push('');
      }
    }
    if (q.expectedComplexity) lines.push('', `**Expected complexity:** ${q.expectedComplexity}`);
    return lines.join('\n');
  };

  const asProblem = (q: GeneratedQuestion): Problem => ({
    id: q.id,
    title: q.title,
    difficulty: q.difficulty,
    tags: [q.topic],
    acceptance: 100,
    minutes: 30,
    statement: buildGeneratedStatement(q),
    testCases: q.testCases,
  });

  const displayProblems = generated ? [asProblem(generated), ...problems] : problems;
  const filtered = difficultyFilter === 'ALL'
    ? displayProblems
    : displayProblems.filter(p => p.difficulty === difficultyFilter);

  const selected = displayProblems.find(p => p.id === selectedId) || displayProblems[0];

  const selectProblem = (p: Problem) => {
    setSelectedId(p.id);
    setEditorLanguage('python');
    updateCode(`# ${p.title} — write your solution here\ndef solution():\n    pass\n`);
  };

  const markSolved = (id: string) => {
    setSolved(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(SOLVED_KEY, JSON.stringify(Array.from(next)));
      } catch { /* ignore */ }
      return next;
    });
  };

  const generateQuestion = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/coding/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'python',
          difficulty: difficultyFilter === 'ALL' ? 'Medium' : difficultyFilter,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.question) {
        const q = json.data.question as GeneratedQuestion;
        setGenerated(q);
        setSelectedId(q.id);
        setEditorLanguage('python');
        updateCode(`# ${q.title}\n# ${q.expectedComplexity || ''}\ndef solution():\n    pass\n`);
      } else {
        setError(json.error || 'Failed to generate a question');
      }
    } catch (err) {
      console.error('[Coding] generation failed:', err);
      setError('Generation service unreachable');
    } finally {
      setGenerating(false);
    }
  };

  const isGeneratedSelected = generated !== null && selected?.id === generated.id;
  const solvedCount = problems.filter(p => solved.has(p.id)).length
    + (generated && solved.has(generated.id) ? 1 : 0);

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 20,
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            Coding Practice
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Solve curated problems, run tests on a real sandbox, and build muscle memory.
          </p>
        </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 10,
        background: 'hsl(142 70% 50% / 0.1)',
        border: '1px solid hsl(142 70% 50% / 0.25)',
        color: 'hsl(142 70% 55%)', fontSize: 13, fontWeight: 600,
      }}>
        <Award size={15} /> {solvedCount}/{problems.length} solved
      </div>
    </div>

      {/* Adaptive coding interview entry */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => navigate('/coding-interview')}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
          background: 'hsl(176 40% 45% / 0.08)',
          border: '1px solid hsl(174 85% 60% / 0.25)',
          fontFamily: 'var(--font-sans)', textAlign: 'left', marginBottom: 16,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'hsl(176 40% 45% / 0.15)',
          border: '1px solid hsl(176 40% 45% / 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain size={17} color="hsl(174 85% 65%)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(174 85% 75%)' }}>
            Full Coding Interview
          </div>
          <div style={{ fontSize: 12.5, color: 'hsl(210 10% 50%)', marginTop: 2 }}>
            Questions grounded in your resume &amp; JD — adaptive difficulty, hints, hidden tests, and an end-of-interview report.
          </div>
        </div>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 9,
          background: 'linear-gradient(135deg, hsl(176 40% 42%), hsl(174 85% 55%))',
          border: 'none', color: 'hsl(220 15% 5%)',
        }}>
          Start <ArrowRight size={13} />
        </span>
      </motion.button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'hsl(210 10% 48%)', margin: 0 }}>
          Generate a fresh question grounded in your session skills — or solve a curated problem below.
        </p>
        <motion.button
          whileHover={{ scale: generating ? 1 : 1.03 }}
          whileTap={{ scale: generating ? 1 : 0.97 }}
          onClick={generateQuestion}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            padding: '9px 18px', borderRadius: 10, cursor: generating ? 'wait' : 'pointer',
            background: 'linear-gradient(135deg, hsl(280 70% 45%), hsl(320 75% 55%))',
            border: 'none', color: 'white',
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
            boxShadow: '0 4px 16px hsl(280 70% 45% / 0.35)',
          }}
        >
          {generating ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
              <Loader2 size={14} />
            </motion.div>
          ) : (
            <Sparkles size={14} />
          )}
          {generating ? 'Generating…' : 'Generate AI Question'}
        </motion.button>
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
        display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16,
        height: 'calc(100vh - 190px)', minHeight: 480,
      }}>
        {/* ── Left: Problem list ─────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', minHeight: 0,
          background: 'hsl(215 15% 8%)',
          border: '1px solid hsl(215 15% 14%)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid hsl(215 15% 13%)' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['ALL', 'Easy', 'Medium', 'Hard'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficultyFilter(d)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)',
                    background: difficultyFilter === d ? 'hsl(176 40% 45% / 0.2)' : 'transparent',
                    color: difficultyFilter === d ? 'hsl(174 85% 75%)' : 'hsl(210 10% 50%)',
                  }}
                >
                  {d === 'ALL' ? 'All' : d}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
                <Loader2 size={18} style={{ marginBottom: 8 }} />
                Loading problems…
              </div>
            ) : filtered.map(p => {
              const active = p.id === selectedId;
              const isSolved = solved.has(p.id);
              return (
                <motion.button
                  key={p.id}
                  whileHover={{ x: 3 }}
                  onClick={() => selectProblem(p)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    padding: '12px 14px', borderRadius: 11,
                    background: active ? 'hsl(176 40% 45% / 0.12)' : 'transparent',
                    border: `1px solid ${active ? 'hsl(174 85% 60% / 0.4)' : 'transparent'}`,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.18s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {isSolved
                      ? <CheckCircle2 size={15} color="hsl(142 70% 55%)" />
                      : <Circle size={15} color={active ? 'hsl(174 85% 65%)' : 'hsl(215 15% 28%)'} />}
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: active ? 'hsl(174 85% 75%)' : 'hsl(210 10% 82%)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {p.title}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      color: diffColor[p.difficulty],
                      background: diffBg[p.difficulty],
                    }}>
                      {p.difficulty}
                    </span>
                    {p.id === generated?.id && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        color: 'hsl(320 75% 65%)',
                        background: 'hsl(320 75% 55% / 0.14)',
                        border: '1px solid hsl(320 75% 55% / 0.3)',
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <Sparkles size={9} /> AI
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11, color: 'hsl(210 10% 45%)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.tags.join(' · ')}
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                      <Clock size={11} /> {p.minutes}m
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Statement + workspace ───────────── */}
        {selected && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, minHeight: 0,
          }}>
            {/* Problem statement */}
            <div style={{
              background: 'hsl(215 15% 8%)',
              border: '1px solid hsl(215 15% 14%)',
              borderRadius: 16, padding: '20px 24px',
              overflowY: 'auto', flexShrink: 0, maxHeight: 260,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'hsl(176 40% 45% / 0.15)',
                  border: '1px solid hsl(176 40% 45% / 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Code2 size={16} color="hsl(174 85% 65%)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 90%)' }}>
                    {selected.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      color: diffColor[selected.difficulty],
                      background: diffBg[selected.difficulty],
                    }}>
                      {selected.difficulty}
                    </span>
                    <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                      {selected.tags.join(' · ')} · {selected.acceptance}% acceptance · {isGeneratedSelected ? generated.hiddenTestCases.length : selected.testCases.length} hidden tests
                    </span>
                  </div>
                </div>
              </div>
              <div style={{
                color: 'hsl(210 10% 78%)', lineHeight: 1.7, fontSize: 13.5, maxWidth: 640,
              }}>
                {selected.statement.split('\n').map((line, i) => {
                  if (line.startsWith('## '))
                    return <h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: 'hsl(210 10% 92%)', marginBottom: 10, letterSpacing: '-0.01em' }}>{line.replace('## ', '')}</h3>;
                  if (line.startsWith('**') && line.endsWith('**'))
                    return <p key={i} style={{ fontWeight: 600, color: 'hsl(174 85% 70%)', marginTop: 12, marginBottom: 6 }}>{line.replace(/\*\*/g, '')}</p>;
                  if (line.startsWith('- '))
                    return <p key={i} style={{ marginLeft: 18, marginBottom: 3, display: 'flex', gap: 8 }}><Target size={12} color="hsl(174 85% 60%)" style={{ marginTop: 4, flexShrink: 0 }} /> {line.slice(2)}</p>;
                  if (line.trim() === '')
                    return <br key={i} />;
                  return <p key={i} style={{ marginBottom: 5 }}>{line}</p>;
                })}
              </div>
            </div>

            {/* Code workspace */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <CodeWorkspace
                testCases={selected.testCases}
                hiddenTestCases={isGeneratedSelected ? generated.hiddenTestCases : undefined}
                expectedComplexity={isGeneratedSelected ? generated.expectedComplexity : undefined}
                onAccepted={() => markSolved(selected.id)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Practice streak banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 16, padding: '12px 18px', borderRadius: 12,
        background: 'hsl(35 90% 55% / 0.07)',
        border: '1px solid hsl(35 90% 55% / 0.2)',
        color: 'hsl(35 90% 70%)', fontSize: 13,
      }}>
        <Flame size={16} />
        Solve a problem with all hidden tests passing to mark it solved.
      </div>
    </motion.div>
  );
}
