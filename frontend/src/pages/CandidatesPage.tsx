import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Mail, TrendingUp, Award, Loader2,
  ArrowUpRight, Target, UserRound,
} from 'lucide-react';
import type { CandidateSummary, InterviewSession } from '../types';
import { apiFetch } from '../lib/api';
import { useIsMobile } from '../lib/useMediaQuery';

const fadePage = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.35 },
};

const modeLabel: Record<string, string> = {
  CODING: 'Coding',
  TECHNICAL: 'Technical',
  BEHAVIORAL: 'Behavioral',
  SYSTEM_DESIGN: 'System Design',
  PROJECT: 'Project',
  HR: 'HR',
  MIXED: 'Mixed',
  RESUME_BASED: 'Resume',
  JD_BASED: 'JD',
  SKILLS_BASED: 'Skills',
  CODING_INTERVIEW: 'Coding Interview',
};

const statusStyle: Record<string, { color: string; bg: string }> = {
  COMPLETED: { color: 'hsl(142 70% 55%)', bg: 'hsl(142 70% 50% / 0.12)' },
  ACTIVE:    { color: 'hsl(174 85% 65%)', bg: 'hsl(174 85% 60% / 0.12)' },
  SETUP:     { color: 'hsl(210 10% 55%)', bg: 'hsl(210 10% 50% / 0.12)' },
  FAILED:    { color: 'hsl(0 85% 60%)',   bg: 'hsl(0 85% 60% / 0.12)' },
};

export default function CandidatesPage() {
  const isMobile = useIsMobile();
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CandidateSummary | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/candidates');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCandidates(json.data);
      }
    } catch (err) {
      console.error('[Candidates] load failed:', err);
      setError('Candidates service unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCandidate = async (c: CandidateSummary) => {
    setSelected(c);
    setDetailLoading(true);
    setSessions([]);
    try {
      const res = await apiFetch(`/api/candidates/${encodeURIComponent(c.id)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.sessions)) {
        setSessions(json.data.sessions);
      }
    } catch (err) {
      console.error('[Candidates] detail load failed:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const initials = (name: string, id: string) => {
    const parts = name.trim().split(/\s+/);
    const base = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (name[0] || id[0] || '?');
    return base.toUpperCase();
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const totalSessions = candidates.reduce((sum, c) => sum + c.sessionCount, 0);

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 22 : 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            Candidates
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Interview pipeline grouped by candidate — auto-derived from resume identity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 10,
            background: 'hsl(176 40% 45% / 0.12)',
            border: '1px solid hsl(176 40% 45% / 0.3)',
            color: 'hsl(174 85% 70%)', fontSize: 13, fontWeight: 600,
          }}>
            <Users size={15} /> {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 10,
            background: 'hsl(215 15% 10%)',
            border: '1px solid hsl(215 15% 18%)',
            color: 'hsl(210 10% 60%)', fontSize: 13, fontWeight: 600,
          }}>
            <Target size={15} /> {totalSessions} sessions
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 12,
          background: 'hsl(0 85% 60% / 0.1)', border: '1px solid hsl(0 85% 60% / 0.3)',
          color: 'hsl(0 85% 65%)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
          <Loader2 size={20} style={{ marginBottom: 10 }} />
          Loading candidates…
        </div>
      ) : candidates.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{ borderRadius: 16, padding: '48px', textAlign: 'center' }}
        >
          <UserRound size={28} color="hsl(210 10% 40%)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 80%)', marginBottom: 6 }}>
            No candidates yet
          </div>
          <div style={{ fontSize: 13, color: 'hsl(210 10% 50%)' }}>
            Start an interview — candidates are grouped automatically from the resume email.
          </div>
        </motion.div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── Candidate cards ──────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidates.map((c, i) => {
              const st = statusStyle[c.latestStatus || 'SETUP'] || statusStyle.SETUP;
              const isSelected = selected?.id === c.id;
              return (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ x: 3 }}
                  onClick={() => openCandidate(c)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    padding: isMobile ? '14px' : '16px 18px', borderRadius: 14,
                    background: isSelected ? 'hsl(176 40% 45% / 0.1)' : 'hsl(215 15% 8%)',
                    border: `1px solid ${isSelected ? 'hsl(174 85% 60% / 0.45)' : 'hsl(215 15% 14%)'}`,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.18s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: 'hsl(210 10% 90%)',
                      background: 'linear-gradient(135deg, hsl(176 40% 40%), hsl(215 80% 50%))',
                    }}>
                      {initials(c.name, c.id)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 88%)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.name || c.email || c.id}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          color: st.color, background: st.bg,
                        }}>
                          {c.latestStatus}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, marginTop: 4,
                        fontSize: 12, color: 'hsl(210 10% 48%)', flexWrap: 'wrap',
                      }}>
                        {c.email && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          }}>
                            <Mail size={11} /> {c.email}
                          </span>
                        )}
                        <span>{c.sessionCount} session{c.sessionCount === 1 ? '' : 's'}</span>
                        <span>Last {fmtDate(c.lastActive)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {c.avgScore != null && (
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'hsl(174 85% 70%)', letterSpacing: '-0.02em' }}>
                          {c.avgScore}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'hsl(210 10% 45%)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        {c.avgScore != null && <><Award size={11} /> avg</>}
                      </div>
                    </div>
                  </div>

                  {/* Sparkline */}
                  {c.scoreTrend.length > 1 && (
                    <div style={{ marginTop: 12, height: 34 }}>
                      <svg width="100%" height="34" viewBox={`0 0 ${Math.max(c.scoreTrend.length - 1, 1) * 30} 34`} preserveAspectRatio="none">
                        <polyline
                          points={c.scoreTrend.map((p, idx) => {
                            const x = idx * 30;
                            const y = p.score == null ? 0 : 34 - (p.score / 100) * 30;
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none" stroke="hsl(174 85% 60%)" strokeWidth="2"
                          strokeLinejoin="round" strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* ── Detail panel ─────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="glass"
            style={{ borderRadius: 16, padding: isMobile ? '16px' : '24px', minHeight: 320 }}
          >
            {!selected ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'hsl(210 10% 45%)', fontSize: 13 }}>
                <Users size={26} style={{ margin: '0 auto 12px' }} />
                Select a candidate to see their full interview history.
              </div>
            ) : detailLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: 'hsl(210 10% 45%)', fontSize: 13 }}>
                <Loader2 size={20} style={{ margin: '0 auto 10px' }} />
                Loading sessions…
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700, color: 'hsl(210 10% 90%)',
                    background: 'linear-gradient(135deg, hsl(176 40% 40%), hsl(215 80% 50%))',
                  }}>
                    {initials(selected.name, selected.id)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'hsl(210 10% 90%)' }}>
                      {selected.name || selected.email || selected.id}
                    </div>
                    <div style={{ fontSize: 12, color: 'hsl(210 10% 48%)', marginTop: 2 }}>
                      {selected.email || selected.id}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'hsl(174 85% 70%)', letterSpacing: '-0.02em' }}>
                      {selected.avgScore != null ? selected.avgScore : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>avg score</div>
                  </div>
                </div>

                {/* Mode breakdown */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20,
                }}>
                  {Object.entries(selected.modes).map(([mode, count]) => (
                    <span key={mode} style={{
                      fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 999,
                      color: 'hsl(174 85% 70%)', background: 'hsl(174 85% 60% / 0.1)',
                      border: '1px solid hsl(174 85% 60% / 0.25)',
                    }}>
                      {modeLabel[mode] || mode} · {count}
                    </span>
                  ))}
                </div>

                {/* Sessions list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessions.length === 0 && (
                    <div style={{ fontSize: 13, color: 'hsl(210 10% 48%)' }}>No sessions found.</div>
                  )}
                  {sessions.map((s) => {
                    const st = statusStyle[s.status] || statusStyle.SETUP;
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px', borderRadius: 10,
                        background: 'hsl(215 15% 7%)',
                        border: '1px solid hsl(215 15% 13%)',
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'hsl(176 40% 45% / 0.12)',
                          border: '1px solid hsl(176 40% 45% / 0.25)',
                        }}>
                          <TrendingUp size={14} color="hsl(174 85% 65%)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 84%)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {s.role} · {s.company}
                          </div>
                          <div style={{ fontSize: 11, color: 'hsl(210 10% 45%)', marginTop: 1 }}>
                            {modeLabel[s.mode] || s.mode} · {fmtDate(s.createdAt)}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          color: st.color, background: st.bg,
                        }}>
                          {s.status}
                        </span>
                        {s.score != null && (
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'hsl(174 85% 70%)', width: 36, textAlign: 'right' }}>
                            {s.score}
                          </span>
                        )}
                        <ArrowUpRight size={14} color="hsl(210 10% 45%)" style={{ flexShrink: 0, display: isMobile ? 'none' : 'block' }} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
