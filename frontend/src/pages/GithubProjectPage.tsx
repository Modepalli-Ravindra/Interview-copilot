import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch, Loader2, Search, Star, GitFork, BookOpen, AlertTriangle,
  CheckCircle2, Layers, FileCode2, Shield, HelpCircle, ExternalLink,
  ArrowRight, Play, Target, Database, Cpu, Server, Boxes, ListTree,
} from 'lucide-react';
import type {
  ProjectProfile,
  ProjectAnalysisResponse,
  ProjectRetrievalContext,
  RepoConsistency,
  ProjectRelevance,
  ProjectQuestion,
  FollowUpItem,
  TechnologyProfile,
  InterviewDifficulty,
} from '../types';
import { apiFetch } from '../lib/api';
import { useIsMobile } from '../lib/useMediaQuery';

const fadePage = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.35 },
};

const TECH_GROUPS: Array<{ key: keyof TechnologyProfile; label: string; icon: typeof Boxes }> = [
  { key: 'frontend', label: 'Frontend', icon: Cpu },
  { key: 'backend', label: 'Backend', icon: Server },
  { key: 'database', label: 'Database', icon: Database },
  { key: 'programmingLanguages', label: 'Languages', icon: FileCode2 },
  { key: 'frameworks', label: 'Frameworks', icon: Boxes },
  { key: 'libraries', label: 'Libraries', icon: Boxes },
  { key: 'devops', label: 'DevOps', icon: Shield },
  { key: 'testing', label: 'Testing', icon: CheckCircle2 },
  { key: 'other', label: 'Other', icon: Layers },
];

const tag = (label: string, color = 'hsl(174 85% 65%)', bg = 'hsl(174 85% 60% / 0.1)') => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11.5, padding: '4px 10px', borderRadius: 999,
    color, background: bg, border: `1px solid ${color}2e`,
  }}>
    {label}
  </span>
);

function SectionCard({ title, icon: Icon, accent = 'hsl(174 85% 65%)', children }: {
  title: string;
  icon: typeof BookOpen;
  accent?: string;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass"
      style={{ borderRadius: 16, padding: isMobile ? '16px' : '20px 22px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${accent}1a`, border: `1px solid ${accent}3d`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color={accent} />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'hsl(210 10% 88%)', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
      </div>
      {children}
    </motion.div>
  );
}

function ConsistencyReport({ report, kind }: { report: RepoConsistency | ProjectRelevance; kind: 'consistency' | 'relevance' }) {
  const isConsistency = kind === 'consistency';
  const overall = report.overall;
  const overallColor = overall === 'aligned' || overall === 'high'
    ? 'hsl(142 70% 55%)'
    : overall === 'partially-aligned' || overall === 'medium'
      ? 'hsl(35 90% 55%)'
      : 'hsl(0 85% 60%)';
  const matches = isConsistency
    ? (report as RepoConsistency).matches.map((m) => ({ name: m.resumeSkill, note: m.note, files: m.githubEvidence }))
    : (report as ProjectRelevance).relevantAreas.map((a) => ({ name: a.jdRequirement, note: '', files: a.githubEvidence }));
  const gaps = isConsistency
    ? (report as RepoConsistency).gaps.map((g) => ({ name: g.resumeSkill, note: g.note }))
    : (report as ProjectRelevance).missingAreas.map((g) => ({ name: g.jdRequirement, note: g.note }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 74, height: 74, position: 'relative', flexShrink: 0 }}>
          <svg width={74} height={74} viewBox="0 0 74 74">
            <circle cx={37} cy={37} r={31} fill="none" stroke="hsl(215 15% 16%)" strokeWidth={7} />
            <circle
              cx={37} cy={37} r={31} fill="none" stroke={overallColor} strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 31}
              strokeDashoffset={2 * Math.PI * 31 * (1 - report.score / 100)}
              transform="rotate(-90 37 37)"
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: overallColor }}>{report.score}%</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '3px 9px', borderRadius: 999,
              color: overallColor, background: `${overallColor}14`,
              border: `1px solid ${overallColor}33`,
            }}>
              {overall}
            </span>
            <span style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>
              {isConsistency ? 'Resume vs GitHub consistency' : 'JD vs GitHub relevance'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5 }}>
            {report.summary}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={{ borderRadius: 11, padding: '13px 15px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(142 70% 60%)', marginBottom: 9 }}>
            {isConsistency ? 'Resume skills found in repo' : 'JD skills demonstrated'} ({matches.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {matches.length === 0 && <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None</span>}
            {matches.map((m) => (
              <div key={m.name} style={{ fontSize: 12.5, color: 'hsl(210 10% 72%)', lineHeight: 1.45 }}>
                <b style={{ color: 'hsl(142 70% 65%)' }}>{m.name}</b>
                {m.files.length > 0 && <span style={{ color: 'hsl(210 10% 48%)' }}> — {m.files.slice(0, 4).join(', ')}</span>}
                {m.note && <div style={{ fontSize: 11.5, color: 'hsl(210 10% 50%)', marginTop: 2 }}>{m.note}</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 11, padding: '13px 15px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(0 85% 60%)', marginBottom: 9 }}>
            {isConsistency ? 'Not evidenced' : 'Not demonstrated'} ({gaps.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {gaps.length === 0 && <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None</span>}
            {gaps.map((g) => (
              <div key={g.name} style={{ fontSize: 12.5, color: 'hsl(210 10% 72%)', lineHeight: 1.45 }}>
                <b style={{ color: 'hsl(0 85% 65%)' }}>{g.name}</b>
                {g.note && <div style={{ fontSize: 11.5, color: 'hsl(210 10% 50%)', marginTop: 2 }}>{g.note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GithubProjectPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [url, setUrl] = useState('');
  const [resumeSkills, setResumeSkills] = useState('');
  const [jdSkills, setJdSkills] = useState('');
  const [analysis, setAnalysis] = useState<ProjectAnalysisResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('Medium');
  const [starting, setStarting] = useState(false);

  const [ask, setAsk] = useState('');
  const [ctx, setCtx] = useState<ProjectRetrievalContext | null>(null);
  const [asking, setAsking] = useState(false);

  const splitSkills = (raw: string): string[] =>
    raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);

  const runAnalysis = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setAnalysis(null);
    setCtx(null);
    try {
      const res = await apiFetch('/api/github/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
          resumeProfileData: splitSkills(resumeSkills).length ? { skills: splitSkills(resumeSkills) } : undefined,
          jdProfileData: splitSkills(jdSkills).length ? { requiredSkills: splitSkills(jdSkills) } : undefined,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.profile) {
        setAnalysis(json.data);
        return;
      }
      throw new Error(json.error || 'GitHub analysis failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GitHub analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const startInterview = async () => {
    const profile = analysis?.profile;
    if (!profile || starting) return;
    setStarting(true);
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'PROJECT',
          difficulty,
          role: role || 'Software Engineer',
          company: company || 'Company',
          projectProfileData: profile,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        navigate(`/interview/${json.data.id}`);
        return;
      }
      throw new Error(json.error || 'Failed to create session');
    } catch (err) {
      console.error('[GithubProject] start failed:', err);
      setError('Failed to create the interview session. Please try again.');
      setStarting(false);
    }
  };

  const askQuestion = async () => {
    const profile = analysis?.profile;
    if (!profile || !ask.trim() || asking) return;
    setAsking(true);
    try {
      const res = await apiFetch('/api/github/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: ask.trim(), profile }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setCtx(json.data);
      } else {
        throw new Error(json.error || 'Retrieval failed');
      }
    } catch (err) {
      console.error('[GithubProject] retrieve failed:', err);
    } finally {
      setAsking(false);
    }
  };

  const profile: ProjectProfile | null = analysis?.profile ?? null;

  return (
    <motion.div {...fadePage}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            GitHub Project Analysis
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Deterministic repository analysis — paste a repo URL and get an evidence-grounded ProjectProfile for interviews.
          </p>
        </div>
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'hsl(176 40% 45% / 0.12)', border: '1px solid hsl(176 40% 45% / 0.3)' }}>
            <GitBranch size={15} color="hsl(174 85% 70%)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(174 85% 70%)' }}>
              {profile.fullName}
            </span>
            {analysis?.fromCache && (
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 999, color: 'hsl(35 90% 65%)', background: 'hsl(35 90% 55% / 0.12)' }}>
                cached
              </span>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass"
        style={{ borderRadius: 16, padding: '20px 22px', marginBottom: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="hsl(210 10% 45%)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runAnalysis(); }}
              placeholder="https://github.com/owner/repo"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 40px', borderRadius: 10,
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 13.5, fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
          <motion.button
            whileHover={{ scale: busy ? 1 : 1.03 }}
            whileTap={{ scale: busy ? 1 : 0.97 }}
            onClick={runAnalysis}
            disabled={busy || !url.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              padding: isMobile ? '12px 0' : '12px 24px', borderRadius: 10,
              background: busy || !url.trim()
                ? 'hsl(215 15% 14%)'
                : 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
              border: 'none',
              color: busy || !url.trim() ? 'hsl(210 10% 40%)' : 'hsl(220 15% 5%)',
              cursor: busy || !url.trim() ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            {busy ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                <Loader2 size={15} />
              </motion.div>
            ) : (
              <GitBranch size={15} />
            )}
            {busy ? 'Analyzing…' : 'Analyze Repository'}
          </motion.button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(210 10% 45%)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Resume skills (optional — checks consistency)
            </label>
            <input
              value={resumeSkills}
              onChange={(e) => setResumeSkills(e.target.value)}
              placeholder="React, Express, TypeScript…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 12.5, fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'hsl(210 10% 45%)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              JD required skills (optional — checks relevance)
            </label>
            <input
              value={jdSkills}
              onChange={(e) => setJdSkills(e.target.value)}
              placeholder="PostgreSQL, Docker, CI/CD…"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 12.5, fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: 'hsl(210 10% 45%)', marginTop: 10, lineHeight: 1.5 }}>
          Analysis is fully deterministic (no LLM): the profile is built from GitHub metadata, README, and a curated set of
          source/config files. Every claim in the question bank is grounded in real files. GitHub API is rate-limited to
          60 requests/hour unauthenticated — results are cached for an hour.
        </p>
        {error && (
          <p style={{ fontSize: 12.5, color: 'hsl(0 85% 62%)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} /> {error}
          </p>
        )}
      </motion.div>

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)', marginBottom: 16 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
            <Loader2 size={18} color="hsl(35 90% 60%)" />
          </motion.div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 82%)' }}>Fetching repo metadata, README, file tree &amp; source files…</p>
            <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>This makes several GitHub API calls and may take a few seconds.</p>
          </div>
        </div>
      )}

      {profile && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Repo metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ borderRadius: 14, padding: '16px 18px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: 'hsl(174 85% 60% / 0.12)', border: '1px solid hsl(174 85% 60% / 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <GitBranch size={16} color="hsl(174 85% 65%)" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <a
                    href={profile.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 14, fontWeight: 700, color: 'hsl(174 85% 75%)',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {profile.fullName} <ExternalLink size={12} />
                  </a>
                  <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>
                    {profile.ownerType === 'Organization' ? 'Organization' : 'User'} · {profile.defaultBranch} branch
                  </p>
                </div>
              </div>
              {profile.description && (
                <p style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.5, marginBottom: 10 }}>
                  {profile.description}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'hsl(35 90% 60%)' }}>
                  <Star size={12} fill="hsl(35 90% 60%)" /> {profile.stars}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'hsl(210 10% 62%)' }}>
                  <GitFork size={12} /> {profile.forks}
                </span>
                {profile.primaryLanguage && tag(profile.primaryLanguage, 'hsl(215 80% 60%)', 'hsl(215 80% 50% / 0.12)')}
                {profile.license && tag(profile.license, 'hsl(280 70% 65%)', 'hsl(280 70% 60% / 0.12)')}
                {profile.isArchived && tag('Archived', 'hsl(0 85% 60%)', 'hsl(0 85% 55% / 0.12)')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {profile.topics.slice(0, 8).map((t) => (
                  <span key={t} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, color: 'hsl(210 10% 60%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                    {t}
                  </span>
                ))}
                {profile.topics.length > 8 && (
                  <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>+{profile.topics.length - 8} more</span>
                )}
              </div>
            </div>

            {/* Summary */}
            <div style={{ borderRadius: 14, padding: '16px 18px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <SparkleIcon />
                <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(174 85% 65%)' }}>
                  Analyzed summary
                </p>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                  {profile.fileCount} files · {new Date(profile.analyzedAt).toLocaleTimeString()}
                </span>
              </div>
              <pre style={{
                whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'var(--font-sans)',
                fontSize: 12, lineHeight: 1.55, color: 'hsl(210 10% 70%)',
                maxHeight: 180, overflowY: 'auto',
              }}>
                {profile.summary}
              </pre>
            </div>
          </div>

          {/* Risks */}
          {profile.risks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '14px 18px', borderRadius: 12, background: 'hsl(35 90% 55% / 0.06)', border: '1px solid hsl(35 90% 55% / 0.22)' }}>
              {profile.risks.map((r) => (
                <p key={r} style={{ fontSize: 12.5, color: 'hsl(35 90% 65%)', display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.45 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {r}
                </p>
              ))}
            </div>
          )}

          {/* Consistency + Relevance */}
          {analysis?.consistency && (
            <SectionCard title="Resume vs GitHub consistency" icon={Target} accent="hsl(142 70% 55%)">
              <ConsistencyReport report={analysis.consistency} kind="consistency" />
            </SectionCard>
          )}
          {analysis?.relevance && (
            <SectionCard title="JD relevance" icon={Target} accent="hsl(215 80% 60%)">
              <ConsistencyReport report={analysis.relevance} kind="relevance" />
            </SectionCard>
          )}

          {/* Technology profile */}
          <SectionCard title="Technology profile" icon={Boxes}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {TECH_GROUPS.map(({ key, label, icon: Icon }) => {
                const items = profile.technologyProfile[key];
                return (
                  <div key={key} style={{ borderRadius: 11, padding: '13px 15px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
                    <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(210 10% 52%)', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={12} /> {label} <span style={{ marginLeft: 'auto', color: 'hsl(210 10% 40%)', fontWeight: 600 }}>{items.length}</span>
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {items.length === 0 && <span style={{ fontSize: 11.5, color: 'hsl(210 10% 42%)' }}>Not detected</span>}
                      {items.slice(0, 12).map((it) => (
                        <span key={it} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                          {it}
                        </span>
                      ))}
                      {items.length > 12 && <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>+{items.length - 12}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Architecture */}
          <SectionCard title="Architecture" icon={Layers} accent="hsl(215 80% 60%)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
              <ArchBox title="Patterns" items={profile.architecture.patterns} />
              <ArchBox title="Entry points" items={profile.architecture.entryPoints} />
              <ArchBox title="Modules" items={profile.architecture.modules} />
              <ArchBox title="Data models" items={profile.dataModels} />
            </div>
            {profile.apiEndpoints.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(215 80% 60%)', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ListTree size={12} /> API endpoints ({profile.apiEndpoints.length})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.apiEndpoints.slice(0, 24).map((e) => (
                    <span key={`${e.method}-${e.path}-${e.file}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                      color: 'hsl(210 10% 70%)', background: 'hsl(215 15% 10%)',
                      border: '1px solid hsl(215 15% 18%)',
                    }}>
                      <b style={{ color: 'hsl(215 80% 65%)', fontSize: 10.5 }}>{e.method}</b>
                      {e.path}
                      <span style={{ color: 'hsl(210 10% 40%)', fontSize: 10.5 }}>{e.file}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* README analysis */}
          <SectionCard title="README analysis" icon={BookOpen} accent="hsl(280 70% 65%)">
            {profile.readme.summary && (
              <p style={{ fontSize: 12.5, color: 'hsl(210 10% 72%)', lineHeight: 1.55, marginBottom: 12 }}>
                {profile.readme.summary}
              </p>
            )}
            {profile.readme.sections.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {profile.readme.sections.slice(0, 12).map((s) => tag(s, 'hsl(280 70% 65%)', 'hsl(280 70% 60% / 0.12)'))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {profile.readme.trusted ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(142 70% 60%)' }}>
                  <CheckCircle2 size={13} /> Claims corroborated by repository files
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(35 90% 60%)' }}>
                  <AlertTriangle size={13} /> No README claims could be verified against the code
                </span>
              )}
            </div>
            {profile.readme.notes.map((n, i) => (
              <p key={i} style={{ fontSize: 11.5, color: 'hsl(210 10% 52%)', lineHeight: 1.5, marginTop: 4 }}>
                {n}
              </p>
            ))}
          </SectionCard>

          {/* Evidence */}
          {profile.evidence.length > 0 && (
            <SectionCard title="Evidence grounding" icon={Shield} accent="hsl(142 70% 55%)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                {profile.evidence.slice(0, 18).map((e) => (
                  <div key={e.claim} style={{ borderRadius: 11, padding: '12px 14px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
                    <p style={{ fontSize: 12.5, color: 'hsl(210 10% 74%)', lineHeight: 1.45, marginBottom: 7 }}>
                      {e.claim}
                    </p>
                    <p style={{ fontSize: 11, color: 'hsl(174 85% 60%)', lineHeight: 1.5 }}>
                      {e.files.join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Project index */}
          <SectionCard title="Project index" icon={FileCode2} accent="hsl(174 85% 65%)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
              {profile.projectIndex.slice(0, 80).map((entry) => (
                <div key={entry.path} style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 12px', borderRadius: 9,
                  background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 14%)',
                }}>
                  <span style={{
                    flexShrink: 0, width: 8, height: 8, borderRadius: '50%',
                    background: entry.importance === 'high' ? 'hsl(174 85% 60%)' : entry.importance === 'medium' ? 'hsl(35 90% 60%)' : 'hsl(210 10% 40%)',
                  }} />
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, width: isMobile ? 74 : 100, color: 'hsl(210 10% 55%)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {entry.importance}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'hsl(210 10% 78%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.path}
                  </span>
                  {entry.language && !isMobile && (
                    <span style={{ flexShrink: 0, fontSize: 11, color: 'hsl(210 10% 45%)' }}>{entry.language}</span>
                  )}
                </div>
              ))}
              {profile.projectIndex.length > 80 && (
                <p style={{ fontSize: 11.5, color: 'hsl(210 10% 45%)', textAlign: 'center' }}>
                  Showing first 80 of {profile.projectIndex.length} indexed files
                </p>
              )}
            </div>
          </SectionCard>

          {/* Questions */}
          <SectionCard title="Question bank" icon={HelpCircle} accent="hsl(320 75% 60%)">
            <p style={{ fontSize: 12, color: 'hsl(210 10% 50%)', marginBottom: 14, lineHeight: 1.5 }}>
              {profile.questions.length} evidence-grounded questions — each maps to concrete files in this repository.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {profile.questions.map((q: ProjectQuestion) => (
                <div key={q.id} style={{ borderRadius: 12, padding: '14px 16px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(320 75% 65%)', marginBottom: 7 }}>
                    {q.category}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'hsl(210 10% 76%)', lineHeight: 1.55, marginBottom: 8 }}>
                    {q.question}
                  </p>
                  {q.groundedIn.length > 0 && (
                    <p style={{ fontSize: 10.5, color: 'hsl(174 85% 55%)', lineHeight: 1.5 }}>
                      Grounded in: {q.groundedIn.slice(0, 4).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Follow-ups */}
          {profile.followUps.length > 0 && (
            <SectionCard title="Follow-up bank" icon={ArrowRight} accent="hsl(35 90% 55%)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {profile.followUps.map((f: FollowUpItem) => (
                  <div key={f.topic} style={{ borderRadius: 12, padding: '14px 16px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: 'hsl(35 90% 65%)', marginBottom: 8 }}>
                      {f.topic}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {f.prompts.map((p) => (
                        <p key={p} style={{ fontSize: 11.5, color: 'hsl(210 10% 66%)', lineHeight: 1.45, paddingLeft: 10, borderLeft: '2px solid hsl(35 90% 55% / 0.4)' }}>
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Retrieval */}
          <SectionCard title="Ask about this repository" icon={Search} accent="hsl(174 85% 65%)">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
                placeholder="e.g. How does the API authenticate users with JWT?"
                style={{
                  flex: 1, minWidth: 0, padding: '11px 14px', borderRadius: 10,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                onClick={askQuestion}
                disabled={asking || !ask.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
                  padding: isMobile ? '11px 0' : '11px 20px', borderRadius: 10,
                  background: ask.trim() && !asking ? 'hsl(174 85% 60% / 0.14)' : 'hsl(215 15% 12%)',
                  color: ask.trim() && !asking ? 'hsl(174 85% 70%)' : 'hsl(210 10% 40%)',
                  border: '1px solid hsl(215 15% 20%)',
                  cursor: ask.trim() && !asking ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                {asking ? <Loader2 size={14} /> : <Search size={14} />}
                {asking ? 'Retrieving…' : 'Retrieve'}
              </button>
            </div>
            {ctx && (
              <div style={{ borderRadius: 11, padding: '13px 15px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(174 85% 60% / 0.25)' }}>
                <p style={{ fontSize: 11, color: 'hsl(174 85% 60%)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileCode2 size={12} /> {ctx.files.length} relevant files
                </p>
                <pre style={{
                  whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'var(--font-sans)',
                  fontSize: 11.5, lineHeight: 1.55, color: 'hsl(210 10% 66%)', maxHeight: 220, overflowY: 'auto',
                }}>
                  {ctx.summary}
                </pre>
              </div>
            )}
          </SectionCard>

          {/* Interview CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass"
            style={{ borderRadius: 16, padding: '22px', border: '1px solid hsl(174 85% 60% / 0.3)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Play size={15} color="hsl(174 85% 65%)" />
              <h2 style={{ fontSize: 14, fontWeight: 700, color: 'hsl(210 10% 88%)' }}>
                Run a Project interview on this repository
              </h2>
            </div>
            <p style={{ fontSize: 12.5, color: 'hsl(210 10% 52%)', marginBottom: 16, lineHeight: 1.5 }}>
              The interview engine receives this structured ProjectProfile (auto-summarized into githubSummary) and asks
              pointed questions about the actual code, architecture, and README claims.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Target role (optional)"
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              />
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company (optional)"
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              />
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as InterviewDifficulty)}
                style={{
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 13, fontFamily: 'var(--font-sans)',
                }}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <motion.button
                whileHover={{ scale: starting ? 1 : 1.03 }}
                whileTap={{ scale: starting ? 1 : 0.97 }}
                onClick={startInterview}
                disabled={starting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 22px', borderRadius: 10,
                  background: starting ? 'hsl(215 15% 16%)' : 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                  border: 'none',
                  color: starting ? 'hsl(210 10% 45%)' : 'hsl(220 15% 5%)',
                  cursor: starting ? 'wait' : 'pointer',
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
                }}
              >
                {starting ? <Loader2 size={15} /> : <Play size={15} fill="hsl(220 15% 5%)" />}
                {starting ? 'Starting…' : 'Start interview'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

function SparkleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="hsl(174 85% 65%)" aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  );
}

function ArchBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ borderRadius: 11, padding: '13px 15px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(210 10% 52%)', marginBottom: 9 }}>
        {title} <span style={{ marginLeft: 6, color: 'hsl(210 10% 40%)' }}>{items.length}</span>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.length === 0 && <span style={{ fontSize: 11.5, color: 'hsl(210 10% 42%)' }}>None detected</span>}
        {items.slice(0, 10).map((it) => (
          <span key={it} style={{ fontSize: 11.5, color: 'hsl(210 10% 66%)', lineHeight: 1.45 }}>{it}</span>
        ))}
        {items.length > 10 && <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>+{items.length - 10} more</span>}
      </div>
    </div>
  );
}
