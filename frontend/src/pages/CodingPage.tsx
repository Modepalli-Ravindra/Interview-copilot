import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Circle, Flame, Code2,
  Award, Target, Clock, Loader2,
} from 'lucide-react';
import CodeWorkspace from '../components/interview/CodeWorkspace';
import { useInterviewStore } from '../stores/interviewStore';
import type { Problem } from '../types';

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
  const { updateCode, setEditorLanguage } = useInterviewStore();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | Difficulty>('ALL');
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
        const res = await fetch('/api/problems');
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

  const selected = problems.find(p => p.id === selectedId) || problems[0];

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

  const filtered = difficultyFilter === 'ALL'
    ? problems
    : problems.filter(p => p.difficulty === difficultyFilter);

  const solvedCount = problems.filter(p => solved.has(p.id)).length;

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
                      {selected.tags.join(' · ')} · {selected.acceptance}% acceptance · {selected.testCases.length} hidden tests
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
