import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Circle, Clock,
  Target, TrendingUp, Sparkles, Loader2, RefreshCw, ArrowUpRight,
} from 'lucide-react';
import type { Roadmap as RoadmapType, InterviewSession } from '../types';

interface RoadmapStep {
  title: string;
  desc: string;
  timeEstimate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'in-progress' | 'pending';
}

interface Category {
  label: string;
  pct: number;
  color: string;
}

const statusStyle: Record<RoadmapStep['status'] | 'completed', { color: string; label: string }> = {
  'completed':    { color: 'hsl(142 70% 50%)',  label: 'Completed' },
  'in-progress':  { color: 'hsl(174 85% 65%)',  label: 'In Progress' },
  'pending':      { color: 'hsl(210 10% 45%)',  label: 'Pending' },
};

const priorityColor: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'hsl(0 85% 60%)',
  MEDIUM: 'hsl(35 90% 55%)',
  LOW: 'hsl(142 70% 50%)',
};

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

export default function RoadmapPage() {
  const [roadmap, setRoadmap] = useState<RoadmapType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [useCustom, setUseCustom] = useState(false);
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [mode, setMode] = useState('TECHNICAL');

  const loadRoadmap = useCallback(async (sessionId?: string) => {
    try {
      const body: Record<string, string> = {};
      if (sessionId) body.sessionId = sessionId;
      if (useCustom) {
        if (role) body.role = role;
        if (company) body.company = company;
        body.mode = mode;
      }
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success && json.data?.roadmap) {
        setRoadmap(json.data.roadmap);
        setError(null);
      } else {
        setError(json.error || 'Failed to generate roadmap');
      }
    } catch (err) {
      console.error('[Roadmap] load failed:', err);
      setError('Roadmap service unreachable');
    }
  }, [useCustom, role, company, mode]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/sessions');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSessions(json.data);
          const latest = json.data
            .filter((s: any) => s.status === 'COMPLETED')
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          if (latest) {
            const first = json.data.filter((s: any) => s.role)[0];
            if (first) { setRole(first.role || ''); setCompany(first.company || ''); }
            await loadRoadmap(latest.id);
          } else {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('[Roadmap] sessions load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRoadmap]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const latest = sessions
        .filter((s) => s.status === 'COMPLETED')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      await loadRoadmap(latest?.id);
    } finally {
      setGenerating(false);
    }
  };

  // Real derived metrics from completed session feedback
  const completed = sessions.filter((s) => s.status === 'COMPLETED' && s.score != null);
  const overallPct = completed.length
    ? Math.round(completed.reduce((sum, s) => sum + (s.score ?? 0), 0) / completed.length)
    : 0;

  const categories: Category[] = (() => {
    const byLabel = new Map<string, { sum: number; count: number; color: string }>();
    const palette = ['hsl(215 80% 60%)', 'hsl(174 85% 60%)', 'hsl(35 90% 55%)', 'hsl(280 70% 65%)', 'hsl(320 75% 60%)', 'hsl(142 70% 50%)'];
    let idx = 0;
    for (const s of completed) {
      const rec = s as unknown as Record<string, any>;
      const fb = rec.feedback as { breakdown?: Array<{ label: string; value: number }> } | null;
      for (const b of fb?.breakdown || []) {
        if (!byLabel.has(b.label)) byLabel.set(b.label, { sum: 0, count: 0, color: palette[idx++ % palette.length] });
        const e = byLabel.get(b.label)!;
        e.sum += b.value;
        e.count += 1;
      }
    }
    return Array.from(byLabel.entries()).map(([label, e]) => ({
      label,
      pct: Math.round(e.sum / e.count),
      color: e.color,
    }));
  })();

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMs ? Math.round(s.durationMs / 60000) : 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const steps: RoadmapStep[] = (roadmap?.steps || []).map((s) => ({
    title: s.title,
    desc: s.desc,
    timeEstimate: s.timeEstimate,
    priority: s.priority,
    status: s.status === 'in-progress' ? 'in-progress' : 'pending',
  }));

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            AI Roadmap
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Personalized learning path generated from your interview gaps.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setUseCustom(c => !c)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'hsl(215 15% 10%)', color: useCustom ? 'hsl(174 85% 70%)' : 'hsl(210 10% 60%)',
              border: `1px solid ${useCustom ? 'hsl(174 85% 60% / 0.4)' : 'hsl(215 15% 18%)'}`,
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
            }}
          >
            <Sparkles size={13} /> Custom target
          </button>
          <motion.button
            whileHover={{ scale: generating ? 1 : 1.03 }}
            whileTap={{ scale: generating ? 1 : 0.97 }}
            onClick={generate}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 10, cursor: generating ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
              border: 'none', color: 'hsl(220 15% 5%)',
              fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 16px hsl(176 40% 45% / 0.35)',
            }}
          >
            {generating ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                <Loader2 size={13} />
              </motion.div>
            ) : (
              <RefreshCw size={13} />
            )}
            {generating ? 'Generating…' : 'Regenerate'}
          </motion.button>
        </div>
      </div>

      {useCustom && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{ borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Role</label>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Backend Engineer"
                style={{ padding: '9px 12px', borderRadius: 9, background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)', border: '1px solid hsl(215 15% 18%)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-sans)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Stripe"
                style={{ padding: '9px 12px', borderRadius: 9, background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)', border: '1px solid hsl(215 15% 18%)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-sans)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 9, background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)', border: '1px solid hsl(215 15% 18%)', outline: 'none', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                <option value="TECHNICAL">Technical</option>
                <option value="CODING">Coding</option>
                <option value="BEHAVIORAL">Behavioral</option>
                <option value="SYSTEM_DESIGN">System Design</option>
                <option value="PROJECT">Project</option>
              </select>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={generate}
              disabled={generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
                background: 'hsl(174 85% 60% / 0.12)', color: 'hsl(174 85% 70%)',
                border: '1px solid hsl(174 85% 60% / 0.35)',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
              }}
            >
              <ArrowUpRight size={14} /> Build
            </motion.button>
          </div>
        </motion.div>
      )}

      {error && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 12,
          background: 'hsl(0 85% 60% / 0.1)', border: '1px solid hsl(0 85% 60% / 0.3)',
          color: 'hsl(0 85% 65%)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left: Timeline ────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass"
          style={{ borderRadius: 16, padding: '24px' }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)', marginBottom: 22 }}>
            Learning Timeline
          </h2>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
              Loading your roadmap…
            </div>
          ) : steps.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
              No roadmap yet. Complete an interview or press Regenerate to build one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {steps.map((step, i) => {
                const st = statusStyle[step.status];
                const isLast = i === steps.length - 1;
                return (
                  <div key={step.title} style={{ display: 'flex', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <motion.div
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 + i * 0.06 }}
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: step.status === 'in-progress'
                            ? 'hsl(174 85% 60% / 0.18)'
                            : 'hsl(215 15% 12%)',
                          border: `1px solid ${step.status === 'in-progress'
                            ? 'hsl(174 85% 60% / 0.5)'
                            : 'hsl(215 15% 22%)'}`,
                        }}
                      >
                        {step.status === 'in-progress'
                          ? <Circle size={16} color="hsl(174 85% 65%)" className="animate-pulse-glow" />
                          : <span style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 45%)' }}>{i + 1}</span>}
                      </motion.div>
                      {!isLast && (
                        <div style={{
                          width: 2, flex: 1, minHeight: 24, marginTop: 4,
                          background: step.status === 'in-progress'
                            ? 'hsl(174 85% 60% / 0.4)'
                            : 'hsl(215 15% 18%)',
                        }} />
                      )}
                    </div>

                    <motion.div
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 + i * 0.06 }}
                      whileHover={{ x: 4 }}
                      style={{
                        flex: 1, marginBottom: 18,
                        padding: '16px 18px', borderRadius: 14,
                        background: step.status === 'in-progress'
                          ? 'hsl(176 40% 45% / 0.08)'
                          : 'hsl(215 15% 9%)',
                        border: `1px solid ${step.status === 'in-progress'
                          ? 'hsl(174 85% 60% / 0.3)'
                          : 'hsl(215 15% 15%)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 86%)' }}>
                          {step.title}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
                          padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase',
                          color: st.color,
                          background: `${st.color}1c`,
                          border: `1px solid ${st.color}40`,
                        }}>
                          {st.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 12.5, color: 'hsl(210 10% 52%)', lineHeight: 1.6, marginBottom: 12 }}>
                        {step.desc}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                          <Clock size={12} /> {step.timeEstimate}
                        </span>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 500, color: priorityColor[step.priority],
                          padding: '3px 10px', borderRadius: 999,
                          background: `${priorityColor[step.priority]}14`,
                          border: `1px solid ${priorityColor[step.priority]}30`,
                        }}>
                          {step.priority} priority
                        </span>
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── Right: Progress summary ───────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Overall progress */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass"
            style={{ borderRadius: 16, padding: '24px', textAlign: 'center' }}
          >
            <div style={{ position: 'relative', width: 150, height: 150, margin: '0 auto 16px' }}>
              <svg viewBox="0 0 36 36" width={150} height={150}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(215 15% 14%)" strokeWidth="3.4" />
                <motion.circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="url(#roadmapGrad)" strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeDasharray={`${overallPct} 100`}
                  transform="rotate(-90 18 18)"
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray: `${overallPct} 100` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="roadmapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(176 40% 45%)" />
                    <stop offset="100%" stopColor="hsl(174 85% 70%)" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 34, fontWeight: 800, color: 'hsl(210 10% 92%)', letterSpacing: '-0.03em' }}>
                  {overallPct}%
                </span>
                <span style={{ fontSize: 11, color: 'hsl(210 10% 50%)', fontWeight: 500 }}>
                  Avg. interview score
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: 'hsl(210 10% 50%)', lineHeight: 1.6 }}>
              Based on <b style={{ color: 'hsl(210 10% 75%)' }}>{completed.length}</b> completed session{completed.length === 1 ? '' : 's'}.
            </p>
          </motion.div>

          {/* Category progress */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="glass"
            style={{ borderRadius: 16, padding: '24px' }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 88%)', marginBottom: 18 }}>
              Skill Areas
            </h3>
            {categories.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'hsl(210 10% 48%)' }}>
                Complete an interview to see your skill breakdown here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {categories.map(({ label, pct, color }, i) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500, color: 'hsl(210 10% 75%)' }}>
                        <Target size={14} color={color} /> {label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 60%)' }}>{pct}%</span>
                    </div>
                    <div style={{
                      height: 7, borderRadius: 999,
                      background: 'hsl(215 15% 14%)', overflow: 'hidden',
                    }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: 'easeOut' }}
                        style={{
                          height: '100%', borderRadius: 999,
                          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Practice summary */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            style={{
              borderRadius: 16, padding: '18px 20px',
              background: 'linear-gradient(135deg, hsl(176 40% 45% / 0.18), hsl(174 85% 60% / 0.08))',
              border: '1px solid hsl(174 85% 60% / 0.3)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: 'hsl(174 85% 60% / 0.15)',
              border: '1px solid hsl(174 85% 60% / 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp size={20} color="hsl(174 85% 70%)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 88%)', marginBottom: 2 }}>
                {totalMinutes > 0 ? `${hours}h ${mins}m` : 'No practice'} logged
              </div>
              <div style={{ fontSize: 12, color: 'hsl(210 10% 55%)' }}>
                {sessions.length > 0
                  ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} recorded — keep the streak going.`
                  : 'Start your first interview to track practice time.'}
              </div>
            </div>
            <CheckCircle2 size={18} color="hsl(174 85% 70%)" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
