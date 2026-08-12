import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mic, Code2, Brain, Zap, GitBranch, CheckCircle2, ChevronRight } from 'lucide-react';
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery';

const features = [
  { icon: Mic,    title: 'Live Voice Interview',    desc: 'Real-time AI conversation with natural interruptions and voice synthesis.' },
  { icon: Code2,  title: 'Coding Workspace',        desc: 'Monaco Editor with Judge0 sandboxed execution across 10+ languages.' },
  { icon: Brain,  title: 'AI Memory Engine',        desc: 'Remembers every answer, probes weaknesses, adapts questions dynamically.' },
  { icon: Zap,    title: 'Multi-Provider Gateway',  desc: 'Powered by OpenCode, Gemini, Claude, and DeepSeek with instant failover.' },
  { icon: GitBranch, title: 'GitHub Project Analysis', desc: 'Analyzes your repositories and asks precise engineering questions.' },
  { icon: CheckCircle2, title: 'ATS Match Engine', desc: 'Semantic resume-to-JD scoring with actionable skill gap roadmaps.' },
];

const fadeUp = {
  initial:  { opacity: 0, y: 24 },
  animate:  { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();

  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ background: 'hsl(220 15% 5%)' }}
    >
      {/* ── Gradient mesh background ─────────────────────── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(176 40% 35% / 0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', top: '30%', right: '-15%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(174 85% 60% / 0.12) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '30%',
          width: 700, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(215 80% 40% / 0.1) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
      </div>

      {/* ── Nav: logo + [Sign In] [Register] only ───────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12,
        padding: isMobile ? '14px 16px' : '20px 48px',
        borderBottom: '1px solid hsl(215 15% 15%)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50,
        background: 'hsl(220 15% 5% / 0.85)',
      }}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2"
          style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
        >
          <div style={{
            width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: 10,
            background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 70%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Mic size={isMobile ? 15 : 18} color="hsl(220 15% 5%)" />
          </div>
          <span style={{
            fontFamily: 'var(--font-sans)', fontWeight: 700,
            fontSize: isNarrow ? 15 : 18,
            color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            InterviewPilot <span style={{ color: 'hsl(174 85% 70%)' }}>AI</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}
        >
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: isMobile ? '9px 14px' : '8px 20px', borderRadius: 8,
              background: 'transparent', border: '1px solid hsl(215 15% 22%)',
              color: 'hsl(210 10% 75%)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: isMobile ? 13 : 14, fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'hsl(176 40% 45%)';
              e.currentTarget.style.color = 'hsl(174 85% 70%)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'hsl(215 15% 22%)';
              e.currentTarget.style.color = 'hsl(210 10% 75%)';
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/register')}
            style={{
              padding: isMobile ? '9px 14px' : '8px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 55%))',
              border: 'none', color: 'hsl(220 15% 5%)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: isMobile ? 13 : 14, fontWeight: 600,
              transition: 'transform 0.15s, box-shadow 0.15s',
              boxShadow: '0 4px 14px hsl(176 40% 45% / 0.35)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px hsl(176 40% 45% / 0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 14px hsl(176 40% 45% / 0.35)';
            }}
          >
            Register
          </button>
        </motion.div>
      </nav>

      {/* ── Hero (no CTAs — auth lives in the navbar) ───── */}
      <main style={{ flex: 1, padding: isMobile ? '48px 16px 0' : '80px 48px 0', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          style={{ textAlign: 'center', marginBottom: isMobile ? 48 : 80 }}
        >
          {/* Badge */}
          <motion.div variants={fadeUp} style={{ display: 'inline-flex', marginBottom: 24, maxWidth: '100%' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', borderRadius: 999,
              border: '1px solid hsl(176 40% 45% / 0.4)',
              background: 'hsl(176 40% 45% / 0.1)',
              color: 'hsl(174 85% 70%)',
              fontSize: isNarrow ? 10 : 12, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: 'hsl(174 85% 70%)',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Powered by OpenCode · Gemini · Claude · DeepSeek
              </span>
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            style={{
              fontSize: isNarrow ? 'clamp(34px, 11vw, 44px)' : 'clamp(40px, 6vw, 72px)',
              fontWeight: 800, lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: 'hsl(210 10% 96%)',
              marginBottom: 24,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Practice AI Interviews
            <br />
            <span style={{
              background: 'linear-gradient(135deg, hsl(176 40% 55%), hsl(174 85% 70%) 60%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Like Real Companies
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            style={{
              fontSize: isMobile ? 16 : 20, color: 'hsl(210 10% 60%)',
              maxWidth: 620, margin: '0 auto 40px',
              lineHeight: 1.6, fontWeight: 400,
              padding: isMobile ? '0 4px' : 0,
            }}
          >
            Real-time voice mock interviews, live coding evaluation,
            GitHub project analysis, and AI-generated feedback
            tailored exactly to your target role.
          </motion.p>
        </motion.div>

        {/* ── Features Grid ─────────────────────────────── */}
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: 20, paddingBottom: 80,
          }}
        >
          {features.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              whileHover={{ y: -4, boxShadow: '0 12px 32px hsl(176 40% 45% / 0.12)' }}
              className="glass glass-hover"
              style={{
                borderRadius: 16, padding: isMobile ? '24px 20px' : '28px 28px',
                cursor: 'default', transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: 16,
                background: 'hsl(176 40% 45% / 0.15)',
                border: '1px solid hsl(176 40% 45% / 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={22} color="hsl(174 85% 70%)" />
              </div>
              <h3 style={{
                fontSize: 16, fontWeight: 600,
                color: 'hsl(210 10% 90%)',
                marginBottom: 8, letterSpacing: '-0.01em',
              }}>
                {title}
              </h3>
              <p style={{ fontSize: 14, color: 'hsl(210 10% 55%)', lineHeight: 1.6 }}>
                {desc}
              </p>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'hsl(174 85% 65%)', fontWeight: 500 }}>
                  Learn more
                </span>
                <ChevronRight size={14} color="hsl(174 85% 65%)" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{
        textAlign: 'center', padding: isMobile ? '20px 16px' : '24px 48px',
        borderTop: '1px solid hsl(215 15% 12%)',
        color: 'hsl(210 10% 40%)', fontSize: 13,
      }}>
        © 2026 InterviewPilot AI — Built for Engineers, by Engineers
      </footer>
    </div>
  );
}
