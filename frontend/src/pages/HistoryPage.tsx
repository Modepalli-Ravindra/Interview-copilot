import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronDown, Mic, Clock, TrendingUp,
  ChevronRight, FileText, AlertTriangle, BarChart3, Lightbulb,
} from 'lucide-react';
import type { InterviewSession } from '../types';

type SessionMode = 'CODING' | 'BEHAVIORAL' | 'SYSTEM_DESIGN' | 'PROJECT' | 'TECHNICAL';

interface HistorySession {
  id: string;
  role: string;
  company: string;
  mode: SessionMode;
  date: string;
  duration: string;
  score: number | null;
  summary: string;
  breakdown: { label: string; value: number }[];
  gaps: { topic: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; details: string }[];
  tips: string[];
  nextTopics: string[];
}

const modeColor: Record<SessionMode, string> = {
  CODING:         'hsl(174 85% 60%)',
  BEHAVIORAL:     'hsl(35 90% 55%)',
  SYSTEM_DESIGN:  'hsl(215 80% 60%)',
  PROJECT:        'hsl(280 70% 65%)',
  TECHNICAL:      'hsl(320 75% 60%)',
};

const severityColor: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH:   'hsl(0 85% 60%)',
  MEDIUM: 'hsl(35 90% 55%)',
  LOW:    'hsl(142 70% 50%)',
};

const scoreColor = (s: number) =>
  s >= 90 ? 'hsl(142 70% 50%)' : s >= 75 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'ALL' | SessionMode>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  const buildHistory = useCallback((records: InterviewSession[]): HistorySession[] => {
    return records
      .filter((s) => s.status === 'COMPLETED' && s.score != null)
      .map((s) => {
        const anyRecord = s as unknown as Record<string, any>;
        const feedback = anyRecord.feedback as {
          summary?: string; breakdown?: { label: string; value: number }[];
          gaps?: { topic: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; details: string }[];
          tips?: string[]; nextTopics?: string[];
        } | null;
        return {
          id: s.id,
          role: s.role || 'Interview',
          company: s.company || 'Unknown',
          mode: (s.mode || 'TECHNICAL') as SessionMode,
          date: new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          duration: typeof s.durationMs === 'number' && s.durationMs > 0 ? `${Math.round(s.durationMs / 60000)}m` : '—',
          score: typeof s.score === 'number' ? s.score : null,
          summary: feedback?.summary || 'Feedback report generated for this session.',
          breakdown: feedback?.breakdown || [],
          gaps: feedback?.gaps || [],
          tips: feedback?.tips || [],
          nextTopics: feedback?.nextTopics || [],
        };
      });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/sessions');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSessions(buildHistory(json.data));
        }
      } catch (err) {
        console.error('[History] load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [buildHistory]);

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q ||
        s.role.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q);
      const matchesMode = modeFilter === 'ALL' || s.mode === modeFilter;
      return matchesQuery && matchesMode;
    });
  }, [query, modeFilter, sessions]);

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
          letterSpacing: '-0.02em', marginBottom: 4,
        }}>
          History
        </h1>
        <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
          Every session, feedback report, and score — all in one place.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
          <Search size={15} color="hsl(210 10% 45%)" style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
          }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by role or company…"
            style={{
              width: '100%', padding: '10px 14px 10px 38px',
              borderRadius: 10, background: 'hsl(215 15% 8%)',
              color: 'hsl(210 10% 85%)',
              border: '1px solid hsl(215 15% 18%)', outline: 'none',
              fontSize: 13, fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'hsl(215 15% 8%)', padding: 4, borderRadius: 10, border: '1px solid hsl(215 15% 16%)' }}>
          {(['ALL', 'CODING', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'PROJECT'] as const).map(m => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              style={{
                padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: modeFilter === m ? 'hsl(176 40% 45% / 0.2)' : 'transparent',
                color: modeFilter === m ? 'hsl(174 85% 75%)' : 'hsl(210 10% 50%)',
              }}
            >
              {m === 'ALL' ? 'All' : m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'hsl(210 10% 45%)' }}>
          {filtered.length} of {sessions.length} sessions
        </span>
      </div>

      {/* Session list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <AnimatePresence>
          {filtered.map((s, i) => {
            const expanded = expandedId === s.id;
            return (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass"
                style={{
                  borderRadius: 14, overflow: 'hidden',
                  borderColor: expanded ? 'hsl(174 85% 60% / 0.35)' : undefined,
                }}
              >
                {/* Row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 20px', background: 'transparent', border: 'none',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                    background: `${modeColor[s.mode]}1a`,
                    border: `1px solid ${modeColor[s.mode]}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Mic size={17} color={modeColor[s.mode]} />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {s.role}
                    </p>
                    <p style={{ fontSize: 12, color: 'hsl(210 10% 48%)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      {s.company} · {s.date}
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                        padding: '2px 8px', borderRadius: 999,
                        color: modeColor[s.mode],
                        background: `${modeColor[s.mode]}1a`,
                        border: `1px solid ${modeColor[s.mode]}35`,
                      }}>
                        {s.mode.replace(/_/g, ' ')}
                      </span>
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'hsl(210 10% 48%)' }}>
                      <Clock size={13} /> {s.duration}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: s.score != null ? scoreColor(s.score) : 'hsl(210 10% 40%)', minWidth: 44, justifyContent: 'flex-end' }}>
                      <TrendingUp size={13} /> {s.score != null ? `${s.score}%` : '—'}
                    </div>
                    <motion.div
                      animate={{ rotate: expanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={16} color="hsl(210 10% 45%)" />
                    </motion.div>
                  </div>
                </button>

                {/* Expanded feedback */}
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        borderTop: '1px solid hsl(215 15% 14%)',
                        padding: '20px 20px 24px',
                        background: 'hsl(215 15% 7%)',
                      }}>
                        {/* Summary */}
                        <div style={{
                          display: 'flex', gap: 12, marginBottom: 20,
                          padding: '14px 16px', borderRadius: 12,
                          background: 'hsl(215 15% 9%)',
                          border: '1px solid hsl(215 15% 14%)',
                        }}>
                          <FileText size={16} color="hsl(174 85% 65%)" style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                              Summary
                            </p>
                            <p style={{ fontSize: 13, color: 'hsl(210 10% 72%)', lineHeight: 1.6 }}>
                              {s.summary}
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          {/* Score breakdown */}
                          <div>
                            <p style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)',
                              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12,
                            }}>
                              <BarChart3 size={13} /> Score Breakdown
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {s.breakdown.map(({ label, value }) => (
                                <div key={label}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                    <span style={{ fontSize: 12, color: 'hsl(210 10% 65%)' }}>{label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 80%)' }}>{value}%</span>
                                  </div>
                                  <div style={{ height: 6, borderRadius: 999, background: 'hsl(215 15% 14%)', overflow: 'hidden' }}>
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${value}%` }}
                                      transition={{ duration: 0.8, delay: 0.1 }}
                                      style={{
                                        height: '100%', borderRadius: 999,
                                        background: value >= 85
                                          ? 'linear-gradient(90deg, hsl(142 70% 45%), hsl(142 70% 60%))'
                                          : value >= 75
                                            ? 'linear-gradient(90deg, hsl(35 90% 45%), hsl(35 90% 60%))'
                                            : 'linear-gradient(90deg, hsl(0 85% 55%), hsl(0 85% 70%))',
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Detected gaps */}
                          <div>
                            <p style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)',
                              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12,
                            }}>
                              <AlertTriangle size={13} /> Detected Gaps
                            </p>
                            {s.gaps.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'hsl(142 70% 55%)' }}>
                                No significant gaps detected — great session!
                              </p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {s.gaps.map(g => (
                                  <div key={g.topic} style={{
                                    padding: '10px 12px', borderRadius: 10,
                                    background: 'hsl(215 15% 9%)',
                                    border: `1px solid ${severityColor[g.severity]}35`,
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(210 10% 80%)' }}>{g.topic}</span>
                                      <span style={{
                                        marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
                                        padding: '2px 8px', borderRadius: 999,
                                        color: severityColor[g.severity],
                                        background: `${severityColor[g.severity]}1c`,
                                      }}>
                                        {g.severity}
                                      </span>
                                    </div>
                                    <p style={{ fontSize: 12, color: 'hsl(210 10% 52%)', lineHeight: 1.55 }}>
                                      {g.details}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tips + next topics */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
                          <div>
                            <p style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)',
                              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12,
                            }}>
                              <Lightbulb size={13} /> Tips
                            </p>
                            {s.tips.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'hsl(210 10% 48%)' }}>No tips recorded.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {s.tips.map((t, i) => (
                                  <p key={i} style={{
                                    fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.55,
                                    paddingLeft: 12, borderLeft: '2px solid hsl(35 90% 55% / 0.45)',
                                  }}>
                                    {t}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontSize: 11, fontWeight: 700, color: 'hsl(210 10% 45%)',
                              letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12,
                            }}>
                              Study Next
                            </p>
                            {s.nextTopics.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'hsl(210 10% 48%)' }}>No topics suggested.</p>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {s.nextTopics.map(t => (
                                  <span key={t} style={{
                                    fontSize: 11.5, padding: '4px 10px', borderRadius: 999,
                                    color: 'hsl(174 85% 70%)',
                                    background: 'hsl(174 85% 60% / 0.1)',
                                    border: '1px solid hsl(174 85% 60% / 0.25)',
                                  }}>
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer action */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                          <button
                            onClick={() => navigate(`/interview/${s.id}`)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
                              background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                              border: 'none', color: 'hsl(220 15% 5%)',
                              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
                            }}
                          >
                            Retry This Interview <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass"
            style={{
              borderRadius: 16, padding: '48px 24px', textAlign: 'center',
            }}
          >
            <Mic size={36} color="hsl(215 15% 28%)" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
              {loading
                ? 'Loading your session history…'
                : sessions.length === 0
                  ? 'No completed interviews yet. Finish an interview to see your feedback reports here.'
                  : 'No sessions match your filters. Try a different search.'}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
