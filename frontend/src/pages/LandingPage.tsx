import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mic, Code2, Brain, Zap, GitBranch, ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery';

// GitHub brand icon — not available in lucide-react v1+
const GithubIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577
      0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756
      -1.333-1.756-1.089-.745.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236
      1.07 1.835 2.807 1.305 3.492.998.108-.776.418-1.305.76-1.605-2.665-.3
      -5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105
      -3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138
      3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84
      1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22
      0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295
      24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

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

      {/* ── Nav ──────────────────────────────────────────── */}
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
          {!isNarrow && (
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: isMobile ? '9px 16px' : '8px 20px', borderRadius: 8,
              border: '1px solid hsl(215 15% 22%)',
              background: 'transparent',
              color: 'hsl(210 10% 75%)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(176 40% 45%)';
              (e.currentTarget as HTMLButtonElement).style.color = 'hsl(174 85% 70%)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(215 15% 22%)';
              (e.currentTarget as HTMLButtonElement).style.color = 'hsl(210 10% 75%)';
            }}
          >
            Dashboard
          </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: isMobile ? '9px 16px' : '8px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 55%))',
              border: 'none', color: 'hsl(220 15% 5%)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              fontSize: 14, fontWeight: 600,
              transition: 'transform 0.15s, box-shadow 0.15s',
              boxShadow: '0 4px 14px hsl(176 40% 45% / 0.35)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px hsl(176 40% 45% / 0.5)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px hsl(176 40% 45% / 0.35)';
            }}
          >
            Get Started Free
          </button>
        </motion.div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
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
            Ace Every Technical
            <br />
            <span style={{
              background: 'linear-gradient(135deg, hsl(176 40% 55%), hsl(174 85% 70%) 60%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Interview with AI
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

          {/* CTA buttons */}
          <motion.div
            variants={fadeUp}
            style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', padding: '0 4px' }}
          >
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 8px 28px hsl(176 40% 45% / 0.55)' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/dashboard')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 28px', borderRadius: 12,
                background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                border: 'none', color: 'hsl(220 15% 5%)',
                cursor: 'pointer', fontSize: 16, fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 4px 20px hsl(176 40% 45% / 0.4)',
                minHeight: 48, width: isMobile ? '100%' : 'auto',
                maxWidth: isMobile ? 340 : 'none',
              }}
            >
              Start Free Mock Interview <ArrowRight size={18} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, borderColor: 'hsl(176 40% 45%)' }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 24px', borderRadius: 12,
                border: '1px solid hsl(215 15% 22%)',
                background: 'hsl(215 15% 10% / 0.6)',
                color: 'hsl(210 10% 80%)',
                cursor: 'pointer', fontSize: 16, fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                backdropFilter: 'blur(8px)',
                minHeight: 48, width: isMobile ? '100%' : 'auto',
                maxWidth: isMobile ? 340 : 'none',
              }}
            >
              <GithubIcon size={18} /> View on GitHub
            </motion.button>
          </motion.div>
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
