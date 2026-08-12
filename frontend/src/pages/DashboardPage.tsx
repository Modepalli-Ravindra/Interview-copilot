import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Mic, TrendingUp, Target, Clock,
  ChevronRight, Plus, FileText, CheckCircle2, Loader2,
} from 'lucide-react';
import type { DashboardData } from '../types';
import { apiFetch } from '../lib/api';
import { useIsMobile } from '../lib/useMediaQuery';

const scoreColor = (s: number) =>
  s >= 90 ? 'hsl(142 70% 50%)' : s >= 75 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/dashboard');
        const json = await res.json();
        if (json.success && json.data) setData(json.data);
      } catch (err) {
        console.error('[Dashboard] load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = data?.stats;
  const statCards = stats ? [
    { label: 'Interviews Done', value: String(stats.totalInterviews), icon: Mic, color: 'hsl(176 40% 45%)' },
    { label: 'Avg. Score', value: stats.avgScore != null ? `${stats.avgScore}%` : '—', icon: TrendingUp, color: 'hsl(142 70% 45%)' },
    { label: 'Hours Practiced', value: `${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`, icon: Clock, color: 'hsl(35 90% 55%)' },
    { label: 'Focus Areas', value: String(stats.topFocusAreas.length), icon: Target, color: 'hsl(174 85% 60%)' },
  ] : [];

  const recentSessions = data?.recentSessions || [];
  const roadmap = data?.roadmap || null;
  const roadmapSteps = roadmap?.steps.slice(0, 4) || [];

  return (
    <motion.div
      {...fadePage}
      style={{ minHeight: '100vh' }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'flex-start',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 16,
        marginBottom: 32,
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 22 : 26, fontWeight: 700,
            color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            Interview Dashboard
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            {loading ? 'Loading your progress…' : `${stats?.totalInterviews ?? 0} session${stats?.totalInterviews === 1 ? '' : 's'} on record. Keep the momentum going.`}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03, boxShadow: '0 6px 24px hsl(176 40% 45% / 0.45)' }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/dashboard/interviews')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 24px', borderRadius: 12,
            background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
            border: 'none', color: 'hsl(220 15% 5%)',
            cursor: 'pointer', fontSize: 14, fontWeight: 700,
            boxShadow: '0 4px 16px hsl(176 40% 45% / 0.35)',
            fontFamily: 'var(--font-sans)',
            minHeight: 44,
            width: isMobile ? '100%' : 'auto',
          }}
        >
          <Plus size={17} /> New Interview
        </motion.button>
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16, marginBottom: 32,
      }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass"
              style={{ borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <Loader2 size={20} color="hsl(210 10% 35%)" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: 'hsl(210 10% 45%)' }}>Loading…</span>
            </motion.div>
          ))
          : statCards.map(({ label, value, icon: Icon, color }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass"
              style={{ borderRadius: 14, padding: '20px 22px' }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 50%)', marginBottom: 6, fontWeight: 500 }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-0.03em' }}>
                    {value}
                  </p>
                </div>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: `${color}22`,
                  border: `1px solid ${color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={color} />
                </div>
              </div>
            </motion.div>
          ))}
      </div>

      {/* Bottom grid: Recent sessions + Roadmap */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr',
        gap: 20,
      }}>

        {/* Recent Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass"
          style={{ borderRadius: 16, padding: '24px' }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>
              Recent Sessions
            </h2>
            <button
              onClick={() => navigate('/dashboard/history')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'hsl(174 85% 65%)', fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 2,
              }}
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentSessions.length === 0 && !loading ? (
              <p style={{ fontSize: 13, color: 'hsl(210 10% 48%)', padding: '8px 0' }}>
                No sessions yet — start your first interview to see results here.
              </p>
            ) : recentSessions.map((s) => (
              <motion.div
                key={s.id}
                whileHover={{ x: 4 }}
                transition={{ type: 'spring', stiffness: 300 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'hsl(215 15% 9%)',
                  border: '1px solid hsl(215 15% 14%)',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/interview/${s.id}`)}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'hsl(176 40% 45% / 0.12)',
                  border: '1px solid hsl(176 40% 45% / 0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={16} color="hsl(174 85% 65%)" />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p style={{
                    fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {s.role} · {s.company}
                  </p>
                  <p style={{ fontSize: 12, color: 'hsl(210 10% 48%)' }}>
                    {s.date} · {s.mode.replace(/_/g, ' ')}
                  </p>
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: s.score != null ? scoreColor(s.score) : 'hsl(210 10% 40%)',
                  flexShrink: 0,
                }}>
                  {s.score != null ? `${s.score}%` : '—'}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Learning Roadmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="glass"
          style={{ borderRadius: 16, padding: '24px' }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>
              AI Learning Roadmap
            </h2>
            <button
              onClick={() => navigate('/dashboard/roadmap')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'hsl(174 85% 65%)', fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 2,
              }}
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
          {roadmapSteps.length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center', borderRadius: 12,
              background: 'hsl(215 15% 9%)', border: '1px dashed hsl(215 15% 20%)',
              color: 'hsl(210 10% 48%)', fontSize: 13,
            }}>
              <Target size={20} color="hsl(210 10% 40%)" style={{ marginBottom: 8 }} />
              Complete an interview to generate your personalized roadmap.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {roadmapSteps.map(({ title, status }, i) => (
                <div key={title} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'hsl(215 15% 9%)',
                  border: `1px solid ${status === 'in-progress'
                    ? 'hsl(174 85% 60% / 0.35)'
                    : 'hsl(215 15% 14%)'}`,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: status === 'in-progress'
                      ? 'hsl(174 85% 60% / 0.2)'
                      : 'hsl(215 15% 13%)',
                    border: `1px solid ${status === 'in-progress'
                      ? 'hsl(174 85% 60% / 0.4)'
                      : 'hsl(215 15% 20%)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    color: status === 'in-progress' ? 'hsl(174 85% 70%)' : 'hsl(210 10% 45%)',
                  }}>
                    {status === 'in-progress' ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(210 10% 80%)' }}>
                      {title}
                    </p>
                    <p style={{ fontSize: 11, color: status === 'in-progress' ? 'hsl(174 85% 60%)' : 'hsl(210 10% 42%)' }}>
                      {status === 'in-progress' ? 'In Progress' : 'Pending'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
