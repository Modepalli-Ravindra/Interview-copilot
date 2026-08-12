import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Mic, Code2, Layers, GitBranch, MessageSquare, Cpu,
  Sparkles, ChevronDown, Play, Clock, TrendingUp, ArrowRight,
  FileText, UploadCloud, Loader2, X, Link2, Unplug, AlignLeft, Target,
} from 'lucide-react';
import type { InterviewSession, GitHubProfile, RepoDetail, ResumeProfile, JdProfile, MatchReport, ProjectProfile } from '../types';
import { apiFetch } from '../lib/api';
import { getVoicePrefs, setVoicePrefs, detectVoiceSupport, type VoicePrefs, type VoiceSupport } from '../lib/voice';
import { useIsMobile, useIsNarrow } from '../lib/useMediaQuery';

type InterviewMode = 'CODING' | 'BEHAVIORAL' | 'SYSTEM_DESIGN' | 'PROJECT' | 'TECHNICAL' | 'HR' | 'MIXED' | 'RESUME_BASED' | 'JD_BASED' | 'SKILLS_BASED' | 'CODING_INTERVIEW';
type InterviewDifficulty = 'Easy' | 'Medium' | 'Hard';

const DEEP_SCAN_REPO_COUNT = 2;
const MATCH_CONTEXT_KEY = 'interviewpilot_match_context';

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

const modes: { key: InterviewMode; label: string; desc: string; icon: typeof Code2 }[] = [
  { key: 'CODING',         label: 'Coding',         desc: 'Algorithms & data structures', icon: Code2 },
  { key: 'TECHNICAL',      label: 'Technical',      desc: 'Concepts, theory & fundamentals', icon: Cpu },
  { key: 'BEHAVIORAL',     label: 'Behavioral',     desc: 'STAR stories & soft skills',    icon: MessageSquare },
  { key: 'SYSTEM_DESIGN',  label: 'System Design',  desc: 'Architecture & scalability',    icon: Layers },
  { key: 'PROJECT',        label: 'Project',        desc: 'GitHub deep dive',             icon: GitBranch },
  { key: 'HR',             label: 'HR',             desc: 'Realistic HR round',           icon: MessageSquare },
  { key: 'MIXED',          label: 'Mixed',          desc: 'HR + technical + project',     icon: Sparkles },
  { key: 'RESUME_BASED',   label: 'Resume-based',   desc: 'Drill into every resume claim', icon: FileText },
  { key: 'JD_BASED',       label: 'JD-based',       desc: 'Map answers to the job',       icon: AlignLeft },
  { key: 'SKILLS_BASED',   label: 'Skills-based',   desc: 'One skill drilled at a time',  icon: Cpu },
  { key: 'CODING_INTERVIEW', label: 'Coding Interview', desc: 'Adaptive multi-question coding', icon: Code2 },
];

const modeColor: Record<InterviewMode, string> = {
  CODING:         'hsl(174 85% 60%)',
  TECHNICAL:      'hsl(320 75% 60%)',
  BEHAVIORAL:     'hsl(35 90% 55%)',
  SYSTEM_DESIGN:  'hsl(215 80% 60%)',
  PROJECT:        'hsl(280 70% 65%)',
  HR:             'hsl(160 70% 60%)',
  MIXED:          'hsl(48 95% 55%)',
  RESUME_BASED:   'hsl(200 85% 60%)',
  JD_BASED:       'hsl(10 85% 62%)',
  SKILLS_BASED:   'hsl(285 75% 66%)',
  CODING_INTERVIEW: 'hsl(176 85% 65%)',
};

const scoreColor = (s: number) =>
  s >= 90 ? 'hsl(142 70% 50%)' : s >= 75 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

export default function InterviewsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();
  const [selectedMode, setSelectedMode] = useState<InterviewMode>('CODING');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('Medium');
  const [filter, setFilter] = useState<'ALL' | InterviewMode>('ALL');
  const [showDifficulty, setShowDifficulty] = useState(false);

  // Context: resume, GitHub, JD
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState<{ name: string; size: string; chars: number; content: string; fileKey?: string | null; fileUrl?: string | null } | null>(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [showResumePaste, setShowResumePaste] = useState(false);
  const [resumeDraft, setResumeDraft] = useState('');
  const [resumeProfileData, setResumeProfileData] = useState<ResumeProfile | null>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);
  const [jdParsing, setJdParsing] = useState(false);
  const [jdProfileData, setJdProfileData] = useState<JdProfile | null>(null);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const [githubUsername, setGithubUsername] = useState('');
  const [github, setGithub] = useState<{ connecting: boolean; connected: boolean; profile: GitHubProfile | null; error: string | null }>({ connecting: false, connected: false, profile: null, error: null });
  const [repoDetails, setRepoDetails] = useState<RepoDetail[]>([]);
  const [scanningRepos, setScanningRepos] = useState(false);
  const [deepScan, setDeepScan] = useState(true);
  const [jd, setJd] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [analysis, setAnalysis] = useState<{ summary: string; strengths: string[]; focusAreas: string[]; suggestedQuestions: string[] } | null>(null);

  // Voice interview prefs (persisted) + mic/synthesis capability probe
  const [voicePrefs, setVoicePrefsState] = useState<VoicePrefs>(() => getVoicePrefs());
  const [voiceSupport, setVoiceSupport] = useState<VoiceSupport>({ sttSupported: false, ttsSupported: false });

  useEffect(() => {
    let cancelled = false;
    detectVoiceSupport().then((support) => {
      if (!cancelled) setVoiceSupport(support);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateVoicePrefs = (patch: Partial<VoicePrefs>) => {
    setVoicePrefsState((prev) => {
      const next = { ...prev, ...patch };
      setVoicePrefs(next);
      return next;
    });
  };

  // Real session list from the backend
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sessions');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setSessions(json.data);
    } catch (err) {
      console.error('[Interviews] load sessions failed:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Import context handed off from the Resume-vs-JD match page, if any.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MATCH_CONTEXT_KEY);
      if (!raw) return;
      window.localStorage.removeItem(MATCH_CONTEXT_KEY);
      const ctx = JSON.parse(raw);
      if (typeof ctx.resumeText === 'string' && ctx.resumeText.trim()) {
        setResume({
          name: ctx.resumeFileName || 'Resume (from match analysis)',
          size: formatFileSize(ctx.resumeText.length),
          chars: ctx.resumeText.length,
          content: ctx.resumeText,
          fileKey: ctx.resumeFileKey || null,
          fileUrl: ctx.resumeFileUrl || null,
        });
      }
      if (ctx.resumeProfile) setResumeProfileData(ctx.resumeProfile as ResumeProfile);
      if (typeof ctx.jdText === 'string' && ctx.jdText.trim()) setJd(ctx.jdText);
      if (ctx.jdProfile) setJdProfileData(ctx.jdProfile as JdProfile);
      if (ctx.matchReport) setMatchReport(ctx.matchReport as MatchReport);
      if (typeof ctx.role === 'string') setRole(ctx.role);
      if (typeof ctx.company === 'string') setCompany(ctx.company);
    } catch (err) {
      console.warn('[Interviews] match context import failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lightSummary = github.profile
    ? `${github.profile.name || github.profile.username}: ${github.profile.publicRepos} public repos, ${github.profile.totalStars} stars. Top languages: ${github.profile.topLanguages.slice(0, 4).join(', ') || 'n/a'}. Top repos: ${github.profile.topRepos.slice(0, 3).map(r => r.name).join(', ') || 'n/a'}`
    : '';

  const truncateStr = (s: string, max: number) =>
    s.length <= max ? s : `${s.slice(0, max)}\n…[truncated]`;
  const indentLines = (s: string, spaces: number) =>
    s.split('\n').map(l => ' '.repeat(spaces) + l).join('\n');

  // Deep summary: README excerpts + file trees + actual source for the top repos.
  const buildDeepSummary = () => {
    const profile = github.profile;
    if (!profile || repoDetails.length === 0) return '';
    const parts: string[] = [];
    parts.push(
      `${profile.name || profile.username} (@${profile.username}) — ${profile.publicRepos} public repos, ${profile.totalStars} stars. Languages: ${profile.topLanguages.slice(0, 4).join(', ') || 'n/a'}.`,
    );
    for (const repo of repoDetails) {
      const readme = repo.readme ? indentLines(truncateStr(repo.readme, 2000), 4) : '';
      const files = repo.topFiles
        .map(f => `    - ${f.path}\n${indentLines(truncateStr(f.content, 1200), 6)}`)
        .join('\n');
      parts.push(
        [
          `REPO: ${repo.name}${repo.language ? ` (${repo.language})` : ''}${repo.stars ? ` — ${repo.stars} stars` : ''}${repo.description ? `\n  Description: ${repo.description}` : ''}`,
          readme ? `  README:\n${readme}` : '',
          `  Key files:\n${files || '    (no source files fetched)'}`,
        ].join('\n'),
      );
    }
    return parts.join('\n\n');
  };

  const startInterview = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const useDeep = selectedMode === 'PROJECT' && deepScan;
      const summary = useDeep ? buildDeepSummary() || lightSummary : lightSummary;
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: selectedMode,
          difficulty,
          role: role || 'Software Engineer',
          company: company || 'Company',
          resumeText: resume?.content || '',
          jdText: jd,
          githubSummary: summary,
          resumeProfileData: resumeProfileData || undefined,
          jdProfileData: jdProfileData || undefined,
          matchReport: matchReport || undefined,
          resumeFileKey: resume?.fileKey || undefined,
          resumeFileUrl: resume?.fileUrl || undefined,
          resumeFileName: resume?.fileKey ? resume.name : undefined,
          voiceMode: voicePrefs.mode,
          voiceEnabled: voicePrefs.enabled,
          sttSupported: voiceSupport.sttSupported,
          ttsSupported: voiceSupport.ttsSupported,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        navigate(`/interview/${json.data.id}`);
        return;
      }
      throw new Error(json.error || 'Failed to create session');
    } catch (err) {
      console.error('[Interviews] start failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to start the interview. Please try again.';
      setStartError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  const formatFileSize = (bytes: number) =>
    bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingResume(true);
    setResume(null);
    setResumeProfileData(null);
    setShowResumePaste(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/api/intelligence/resume', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Resume parsing failed');
      const content = String(json.data.text || '');
      setResume({
        name: file.name,
        size: formatFileSize(file.size),
        chars: content.length,
        content,
        fileKey: json.data.resumeFileKey || null,
        fileUrl: json.data.resumeFileUrl || null,
      });
      setResumeProfileData(json.data.profile || null);
    } catch (err) {
      console.error('[Interviews] resume parse failed:', err);
      setResume({ name: file.name, size: formatFileSize(file.size), chars: 0, content: '' });
    } finally {
      setIsParsingResume(false);
      e.target.value = '';
    }
  };

  const applyResumeText = (text: string) => {
    const content = text.trim();
    setResumeDraft(content);
    if (content.length > 0) {
      setResume({
        name: 'Pasted resume',
        size: `${Math.max(1, Math.round(content.length / 1024))} KB`,
        chars: content.length,
        content,
      });
      setResumeProfileData(null);
      setShowResumePaste(false);
    }
  };

  const handleJdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJdParsing(true);
    setJd('');
    setJdProfileData(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/api/intelligence/jd', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'JD parsing failed');
      setJd(String(json.data.text || ''));
      setJdProfileData(json.data.profile || null);
    } catch (err) {
      console.error('[Interviews] JD parse failed:', err);
    } finally {
      setJdParsing(false);
      e.target.value = '';
    }
  };

  const handleGithubConnect = async () => {
    const username = githubUsername.trim();
    if (!username) return;
    setGithub(g => ({ ...g, connecting: true, error: null }));
    try {
      const looksLikeRepo =
        /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+(\/)?$/i.test(username) ||
        /^[\w.-]+\/[\w.-]+(\.git)?$/i.test(username) ||
        /^git@github\.com:[\w.-]+\/[\w.-]+(\.git)?$/i.test(username);

      if (looksLikeRepo) {
        const res = await apiFetch('/api/github/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: username }),
        });
        const json = await res.json();
        if (json.success && json.data?.profile) {
          const p = json.data.profile as ProjectProfile;
          const profile: GitHubProfile = {
            username: p.owner,
            name: p.fullName || p.owner,
            avatar: `https://github.com/${p.owner}.png`,
            bio: p.description || '',
            followers: 0,
            publicRepos: 1,
            topLanguages: p.languages.slice(0, 6),
            topRepos: [{
              name: p.repo,
              description: p.description,
              language: p.primaryLanguage,
              stars: p.stars,
              url: p.repoUrl,
            }],
            totalStars: p.stars,
          };
          setGithub({ connecting: false, connected: true, profile, error: null });
          return;
        }
        setGithub(g => ({ ...g, connecting: false, error: json.error || 'GitHub analysis failed' }));
        return;
      }

      const res = await apiFetch(`/api/github/${encodeURIComponent(username)}`);
      const json = await res.json();
      if (json.success && json.data) {
        const profile = json.data as GitHubProfile;
        setGithub({ connecting: false, connected: true, profile, error: null });
        fetchRepoDetails(profile);
      } else {
        setGithub(g => ({ ...g, connecting: false, error: json.error || 'GitHub lookup failed' }));
      }
    } catch (err) {
      console.error('[Interviews] github lookup failed:', err);
      setGithub(g => ({ ...g, connecting: false, error: 'GitHub API unreachable' }));
    }
  };

  const fetchRepoDetails = async (profile: GitHubProfile) => {
    const targets = profile.topRepos.slice(0, DEEP_SCAN_REPO_COUNT);
    if (targets.length === 0) return;
    setScanningRepos(true);
    setRepoDetails([]);
    try {
      const results = await Promise.all(
        targets.map(async (r) => {
          try {
            const res = await apiFetch(`/api/github/${encodeURIComponent(profile.username)}/${encodeURIComponent(r.name)}`);
            const json = await res.json();
            return json.success ? (json.data as RepoDetail) : null;
          } catch {
            return null;
          }
        }),
      );
      setRepoDetails(results.filter((d): d is RepoDetail => d !== null));
    } finally {
      setScanningRepos(false);
    }
  };

  const disconnectGithub = () => {
    setGithub({ connecting: false, connected: false, profile: null, error: null });
    setRepoDetails([]);
    setScanningRepos(false);
  };

  const analyzeResume = async () => {
    if (!resume?.content) return;
    setIsAnalyzingResume(true);
    try {
      const res = await apiFetch('/api/analysis/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resume.content,
          role: role || 'Software Engineer',
          company: company || 'Unknown',
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.analysis) {
        setAnalysis(json.data.analysis);
      } else {
        throw new Error(json.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('[Interviews] resume analysis failed:', err);
      setAnalysis(null);
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const filtered = filter === 'ALL' ? sessions : sessions.filter(s => s.mode === filter);
  const activeMode = modes.find(m => m.key === selectedMode)!;

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            Interviews
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Practice with a live AI interviewer and get instant feedback.
          </p>
        </div>
      </div>

      {/* ── New interview setup ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass"
        style={{ borderRadius: 16, padding: isMobile ? '20px 16px' : '24px', marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={15} color="hsl(174 85% 65%)" />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>
            Start a New Interview
          </h2>
        </div>
        <p style={{ fontSize: 13, color: 'hsl(210 10% 50%)', marginBottom: 18 }}>
          Pick a mode, describe the target role, and let the AI conduct a realistic mock interview.
        </p>

        {/* Mode tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {modes.map(({ key, label, desc, icon: Icon }) => {
            const active = selectedMode === key;
            return (
              <motion.button
                key={key}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedMode(key)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  padding: '16px 16px', borderRadius: 12,
                  background: active ? 'hsl(176 40% 45% / 0.12)' : 'hsl(215 15% 9%)',
                  border: `1px solid ${active ? 'hsl(174 85% 60% / 0.5)' : 'hsl(215 15% 15%)'}`,
                  transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9, marginBottom: 12,
                  background: active ? 'hsl(174 85% 60% / 0.2)' : 'hsl(215 15% 14%)',
                  border: `1px solid ${active ? 'hsl(174 85% 60% / 0.4)' : 'hsl(215 15% 22%)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} color={active ? 'hsl(174 85% 70%)' : 'hsl(210 10% 55%)'} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: active ? 'hsl(174 85% 75%)' : 'hsl(210 10% 82%)', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: 'hsl(210 10% 48%)', lineHeight: 1.45 }}>
                  {desc}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Role / company / difficulty */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isNarrow ? '1fr 1fr' : '1fr 1fr 1fr auto',
          gap: 12, alignItems: 'center', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Target Role</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 13, fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Company</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 13, fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Level</label>
            <button
              onClick={() => setShowDifficulty(s => !s)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
                border: '1px solid hsl(215 15% 18%)', outline: 'none',
                fontSize: 13, fontFamily: 'var(--font-sans)',
              }}
            >
              {difficulty} <ChevronDown size={14} color="hsl(210 10% 50%)" />
            </button>
            {showDifficulty && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: 'hsl(215 15% 10%)', border: '1px solid hsl(215 15% 18%)',
                  borderRadius: 10, overflow: 'hidden', zIndex: 30,
                  boxShadow: '0 8px 24px hsl(220 15% 3% / 0.7)',
                }}
              >
                {(['Easy', 'Medium', 'Hard'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => { setDifficulty(lvl); setShowDifficulty(false); }}
                    style={{
                      display: 'block', width: '100%', padding: '9px 12px',
                      textAlign: 'left', border: 'none', cursor: 'pointer',
                      background: difficulty === lvl ? 'hsl(176 40% 45% / 0.15)' : 'transparent',
                      color: difficulty === lvl ? 'hsl(174 85% 70%)' : 'hsl(210 10% 65%)',
                      fontSize: 13, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {lvl}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          <motion.button
            whileHover={{ scale: isStarting ? 1 : 1.03, boxShadow: isStarting ? 'none' : '0 6px 24px hsl(176 40% 45% / 0.45)' }}
            whileTap={{ scale: isStarting ? 1 : 0.97 }}
            onClick={startInterview}
            disabled={isStarting}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-end',
              padding: '11px 24px', borderRadius: 10, minHeight: 44,
              background: isStarting
                ? 'hsl(215 15% 16%)'
                : 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
              border: 'none',
              color: isStarting ? 'hsl(210 10% 45%)' : 'hsl(220 15% 5%)',
              cursor: isStarting ? 'wait' : 'pointer',
              fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
              boxShadow: isStarting ? 'none' : '0 4px 16px hsl(176 40% 45% / 0.35)',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            {isStarting ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                <Loader2 size={15} />
              </motion.div>
            ) : (
              <Play size={15} fill="hsl(220 15% 5%)" />
            )}
            {isStarting ? 'Starting…' : `Start ${activeMode.label}`}
          </motion.button>
        </div>

        {startError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            borderRadius: 12, padding: '12px 14px', marginBottom: 20,
            background: 'hsl(0 85% 50% / 0.08)', border: '1px solid hsl(0 85% 50% / 0.35)',
          }}>
            <X size={16} color="hsl(0 85% 65%)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'hsl(0 85% 70%)' }}>
                Couldn't start the interview
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.5, color: 'hsl(210 10% 55%)' }}>
                {startError} Please check your connection and try again.
              </p>
            </div>
            <button
              onClick={() => setStartError(null)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'hsl(210 10% 45%)', fontFamily: 'var(--font-sans)',
                padding: 2,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Voice settings (persisted) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          borderRadius: 12, padding: '12px 14px', marginBottom: 20,
          background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: voicePrefs.enabled ? 'hsl(176 40% 45% / 0.18)' : 'hsl(215 15% 14%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mic size={15} color={voicePrefs.enabled ? 'hsl(174 85% 70%)' : 'hsl(210 10% 50%)'} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)' }}>Voice interview</div>
              <div style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>
                {voiceSupport.sttSupported
                  ? 'Microphone detected — answers spoken aloud.'
                  : 'No microphone found — answers will be typed.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12.5, color: 'hsl(210 10% 65%)' }}>
              <input
                type="checkbox"
                checked={voicePrefs.enabled}
                onChange={(e) => updateVoicePrefs({ enabled: e.target.checked })}
              />
              Voice on
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12.5, color: 'hsl(210 10% 65%)' }}>
              <input
                type="checkbox"
                checked={voicePrefs.mode === 'voice'}
                onChange={(e) => updateVoicePrefs({ mode: e.target.checked ? 'voice' : 'text' })}
              />
              Spoken answers
            </label>
          </div>
        </div>

        {/* ── Interview context: resume / GitHub / JD ── */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FileText size={14} color="hsl(174 85% 65%)" />
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)' }}>
              Interview Context
            </h3>
          </div>
          <p style={{ fontSize: 12.5, color: 'hsl(210 10% 48%)', marginBottom: 14 }}>
            Provide your resume and GitHub so the AI can personalize the interview.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}>

            {/* Resume upload */}
            <div style={{
              borderRadius: 12, padding: '16px',
              background: 'hsl(215 15% 9%)',
              border: resume
                ? '1px solid hsl(142 70% 50% / 0.4)'
                : '1px dashed hsl(215 15% 24%)',
              transition: 'border-color 0.2s',
            }}>
              <input
                ref={resumeInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={handleResumeUpload}
              />
              {isParsingResume ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                    <Loader2 size={20} color="hsl(35 90% 60%)" />
                  </motion.div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 80%)' }}>Parsing resume…</p>
                    <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>Extracting skills & experience</p>
                  </div>
                </div>
              ) : resume ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: 'hsl(142 70% 50% / 0.12)',
                      border: '1px solid hsl(142 70% 50% / 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText size={17} color="hsl(142 70% 55%)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 12.5, fontWeight: 600, color: 'hsl(210 10% 85%)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {resume.name}
                      </p>
                      <p style={{ fontSize: 11.5, color: 'hsl(142 70% 55%)' }}>
                        {resume.size} · {resume.chars.toLocaleString()} chars parsed ✓
                      </p>
                    </div>
                    <button
                      onClick={() => { setResume(null); setResumeProfileData(null); setShowResumePaste(false); setResumeDraft(''); setAnalysis(null); }}
                      title="Remove resume"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0,
                      }}
                    >
                      <X size={15} color="hsl(210 10% 45%)" />
                    </button>
                  </div>
                  <button
                    onClick={analyzeResume}
                    disabled={isAnalyzingResume}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '8px 14px', borderRadius: 8, cursor: isAnalyzingResume ? 'wait' : 'pointer',
                      background: 'hsl(174 85% 60% / 0.1)', color: 'hsl(174 85% 70%)',
                      border: '1px solid hsl(174 85% 60% / 0.3)',
                      fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {isAnalyzingResume ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                        <Loader2 size={13} />
                      </motion.div>
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {isAnalyzingResume ? 'Analyzing…' : 'Analyze resume with AI'}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => resumeInputRef.current?.click()}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'var(--font-sans)', padding: 0,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, marginBottom: 10,
                      background: 'hsl(174 85% 60% / 0.1)',
                      border: '1px solid hsl(174 85% 60% / 0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <UploadCloud size={17} color="hsl(174 85% 65%)" />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 82%)', marginBottom: 2 }}>
                      Upload Resume
                    </p>
                    <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)', lineHeight: 1.5 }}>
                      PDF, TXT or MD · powers real-time personalized questions
                    </p>
                  </button>
                  <button
                    onClick={() => setShowResumePaste(s => !s)}
                    style={{
                      marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, fontFamily: 'var(--font-sans)',
                      fontSize: 12, fontWeight: 600, color: 'hsl(174 85% 70%)',
                    }}
                  >
                    {showResumePaste ? '− Hide' : '+ Or paste resume text'}
                  </button>
                  {showResumePaste && (
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        value={resumeDraft}
                        onChange={e => setResumeDraft(e.target.value)}
                        placeholder="Paste your resume content here…"
                        rows={4}
                        style={{
                          width: '100%', boxSizing: 'border-box', resize: 'vertical',
                          padding: '10px 12px', borderRadius: 8,
                          background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                          border: '1px solid hsl(215 15% 18%)', outline: 'none',
                          fontSize: 12.5, lineHeight: 1.5, fontFamily: 'var(--font-sans)',
                        }}
                      />
                      <button
                        onClick={() => applyResumeText(resumeDraft)}
                        disabled={resumeDraft.trim().length === 0}
                        style={{
                          marginTop: 8, padding: '6px 14px', borderRadius: 8,
                          background: resumeDraft.trim().length > 0 ? 'hsl(174 85% 60% / 0.12)' : 'hsl(215 15% 12%)',
                          color: resumeDraft.trim().length > 0 ? 'hsl(174 85% 70%)' : 'hsl(210 10% 40%)',
                          border: resumeDraft.trim().length > 0 ? '1px solid hsl(174 85% 60% / 0.35)' : '1px solid hsl(215 15% 18%)',
                          cursor: resumeDraft.trim().length > 0 ? 'pointer' : 'not-allowed',
                          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        }}
                      >
                        Use this resume
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GitHub connection */}
            <div style={{
              borderRadius: 12, padding: '16px',
              background: 'hsl(215 15% 9%)',
              border: github.connected
                ? '1px solid hsl(174 85% 60% / 0.4)'
                : '1px dashed hsl(215 15% 24%)',
              transition: 'border-color 0.2s',
            }}>
              {github.connecting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                    <Loader2 size={20} color="hsl(35 90% 60%)" />
                  </motion.div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 80%)' }}>Connecting…</p>
                    <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>Waiting for GitHub authorization</p>
                  </div>
                </div>
              ) : github.connected && github.profile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={github.profile.avatar}
                    alt={github.profile.username}
                    style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, border: '1px solid hsl(174 85% 60% / 0.3)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(210 10% 85%)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {github.profile.name || github.profile.username}
                    </p>
                    <p style={{ fontSize: 11.5, color: 'hsl(142 70% 55%)' }}>
                      {github.profile.publicRepos} repos · {github.profile.followers} followers ✓
                    </p>
                    {scanningRepos && (
                      <p style={{ fontSize: 11, color: 'hsl(35 90% 60%)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                          <Loader2 size={11} />
                        </motion.div>
                        Reading top repos…
                      </p>
                    )}
                    {!scanningRepos && repoDetails.length > 0 && (
                      <p style={{ fontSize: 11, color: 'hsl(174 85% 60%)', marginTop: 4 }}>
                        {repoDetails.length} repos loaded for Project deep-dive
                      </p>
                    )}
                  </div>
                  <button
                    onClick={disconnectGithub}
                    title="Disconnect GitHub"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0,
                    }}
                  >
                    <Unplug size={15} color="hsl(210 10% 45%)" />
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, marginBottom: 10,
                    background: 'hsl(215 15% 13%)',
                    border: '1px solid hsl(215 15% 22%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <GithubIcon size={17} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 82%)', marginBottom: 2 }}>
                    Link a GitHub profile
                  </p>
                  <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)', lineHeight: 1.5, marginBottom: 10 }}>
                    The AI uses your public repos in Project &amp; Technical modes. Enter a username or a repository URL.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={githubUsername}
                      onChange={e => setGithubUsername(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleGithubConnect(); }}
                      placeholder="github username or repo URL"
                      style={{
                        flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8,
                        background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                        border: '1px solid hsl(215 15% 18%)', outline: 'none',
                        fontSize: 12, fontFamily: 'var(--font-sans)',
                      }}
                    />
                    <button
                      onClick={handleGithubConnect}
                      disabled={github.connecting || !githubUsername.trim()}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 8,
                        cursor: github.connecting || !githubUsername.trim() ? 'not-allowed' : 'pointer',
                        background: 'hsl(174 85% 60% / 0.1)', color: 'hsl(174 85% 70%)',
                        border: '1px solid hsl(174 85% 60% / 0.3)',
                        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        opacity: github.connecting || !githubUsername.trim() ? 0.55 : 1,
                      }}
                    >
                      {github.connecting ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                          <Loader2 size={13} />
                        </motion.div>
                      ) : (
                        <Link2 size={13} />
                      )}
                      {github.connecting ? 'Fetching…' : 'Fetch'}
                    </button>
                  </div>
                  {github.error && (
                    <p style={{ fontSize: 11.5, color: 'hsl(0 85% 60%)', marginTop: 8 }}>
                      {github.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* JD (optional) */}
            <div style={{
              borderRadius: 12, padding: '16px',
              background: 'hsl(215 15% 9%)',
              border: jd.trim() ? '1px solid hsl(174 85% 60% / 0.4)' : '1px dashed hsl(215 15% 24%)',
              transition: 'border-color 0.2s',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: 'hsl(215 15% 13%)',
                  border: '1px solid hsl(215 15% 22%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlignLeft size={17} color="hsl(210 10% 55%)" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 82%)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Job Description
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: 999,
                      color: 'hsl(35 90% 65%)', background: 'hsl(35 90% 55% / 0.12)',
                      border: '1px solid hsl(35 90% 55% / 0.3)',
                    }}>
                      Optional
                    </span>
                  </p>
                  <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>
                    Paste the JD or upload a file to match questions to the role
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  ref={jdInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  style={{ display: 'none' }}
                  onChange={handleJdUpload}
                />
                <button
                  onClick={() => jdInputRef.current?.click()}
                  disabled={jdParsing}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, cursor: jdParsing ? 'wait' : 'pointer',
                    background: 'hsl(174 85% 60% / 0.08)', color: 'hsl(174 85% 70%)',
                    border: '1px solid hsl(174 85% 60% / 0.3)',
                    fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  }}
                >
                  {jdParsing ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                      <Loader2 size={12} />
                    </motion.div>
                  ) : (
                    <UploadCloud size={12} />
                  )}
                  {jdParsing ? 'Parsing…' : 'Upload JD'}
                </button>
                {jdProfileData && (
                  <>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '3px 9px', borderRadius: 999,
                      color: 'hsl(174 85% 65%)', background: 'hsl(174 85% 60% / 0.1)',
                      border: '1px solid hsl(174 85% 60% / 0.3)',
                    }}>
                      {jdProfileData.requiredSkills.length} required skills parsed
                    </span>
                    {jdProfileData.location && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 600,
                        padding: '3px 9px', borderRadius: 999,
                        color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)',
                        border: '1px solid hsl(215 15% 20%)',
                      }}>
                        {jdProfileData.location}
                      </span>
                    )}
                    {jdProfileData.educationRequirements.slice(0, 1).map(e => (
                      <span key={e} style={{
                        fontSize: 10.5, fontWeight: 600,
                        padding: '3px 9px', borderRadius: 999,
                        color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)',
                        border: '1px solid hsl(215 15% 20%)',
                      }}>
                        {e}
                      </span>
                    ))}
                  </>
                )}
              </div>
              <textarea
                value={jd}
                onChange={e => setJd(e.target.value)}
                placeholder="Paste the job description here…"
                rows={2}
                style={{
                  flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 8,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 12.5, lineHeight: 1.5, fontFamily: 'var(--font-sans)',
                  minHeight: 44,
                }}
              />
            </div>
          </div>

          {/* Match analysis chip (from Resume vs JD page) */}
          {matchReport && (
            <div style={{
              marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '11px 14px', borderRadius: 10,
              background: 'hsl(174 85% 60% / 0.08)', border: '1px solid hsl(174 85% 60% / 0.25)',
            }}>
              <Target size={15} color="hsl(174 85% 70%)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'hsl(210 10% 72%)', lineHeight: 1.5 }}>
                Resume–JD fit: <b style={{ color: scoreColor(matchReport.overallMatch) }}>{matchReport.overallMatch}% overall</b>
                {' · '}skill {matchReport.skillMatch}%{matchReport.matchedSkills.length > 0 ? ` · ${matchReport.matchedSkills.length} matched` : ''}
                {matchReport.missingSkills.length > 0 ? ` · ${matchReport.missingSkills.length} missing` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Project deep-scan toggle */}
        {selectedMode === 'PROJECT' && github.connected && (
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, cursor: 'pointer',
              padding: '10px 14px', borderRadius: 10,
              background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 16%)',
            }}
          >
            <input
              type="checkbox"
              checked={deepScan}
              onChange={e => setDeepScan(e.target.checked)}
              style={{ accentColor: 'hsl(174 85% 60%)', cursor: 'pointer' }}
            />
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(210 10% 82%)' }}>
                Deep repo scan
              </p>
              <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>
                Feed the AI READMEs + source code from your top {DEEP_SCAN_REPO_COUNT} repos for a code-level project deep dive
              </p>
            </div>
            {scanningRepos && (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ marginLeft: 'auto' }}>
                <Loader2 size={14} color="hsl(35 90% 60%)" />
              </motion.div>
            )}
            {!scanningRepos && repoDetails.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                padding: '3px 9px', borderRadius: 999, color: 'hsl(174 85% 65%)',
                background: 'hsl(174 85% 60% / 0.1)', border: '1px solid hsl(174 85% 60% / 0.3)',
              }}>
                {repoDetails.length} repos loaded
              </span>
            )}
          </label>
        )}

        {/* Resume analysis results */}
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass"
            style={{ borderRadius: 16, padding: '20px 24px', marginTop: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={15} color="hsl(174 85% 65%)" />
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>
                AI Resume Analysis
              </h3>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'hsl(210 10% 72%)', marginBottom: 16, maxWidth: 720 }}>
              {analysis.summary}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(142 70% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Strengths
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {analysis.strengths.map(s => (
                    <span key={s} style={{
                      fontSize: 11.5, padding: '4px 10px', borderRadius: 999,
                      color: 'hsl(142 70% 65%)',
                      background: 'hsl(142 70% 50% / 0.1)',
                      border: '1px solid hsl(142 70% 50% / 0.25)',
                    }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(35 90% 60%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Focus Areas
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {analysis.focusAreas.map(s => (
                    <span key={s} style={{
                      fontSize: 11.5, padding: '4px 10px', borderRadius: 999,
                      color: 'hsl(35 90% 65%)',
                      background: 'hsl(35 90% 55% / 0.1)',
                      border: '1px solid hsl(35 90% 55% / 0.25)',
                    }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {analysis.suggestedQuestions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: 'hsl(174 85% 65%)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                  The AI may ask about
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {analysis.suggestedQuestions.map(q => (
                    <p key={q} style={{
                      fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.5,
                      paddingLeft: 12, borderLeft: '2px solid hsl(174 85% 60% / 0.4)',
                    }}>
                      {q}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* ── Sessions list ────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 12,
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)' }}>
          Your Interviews
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: 'hsl(215 15% 8%)', padding: 4, borderRadius: 10, border: '1px solid hsl(215 15% 16%)' }}>
          {(['ALL', 'CODING', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'PROJECT', 'HR', 'MIXED', 'RESUME_BASED', 'JD_BASED', 'SKILLS_BASED', 'CODING_INTERVIEW'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: filter === f ? 'hsl(176 40% 45% / 0.2)' : 'transparent',
                color: filter === f ? 'hsl(174 85% 75%)' : 'hsl(210 10% 50%)',
              }}
            >
              {f === 'ALL' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass"
        style={{ borderRadius: 16, padding: '10px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loadingSessions ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
              Loading your interviews…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'hsl(210 10% 48%)', fontSize: 13 }}>
              <p style={{ margin: '0 0 14px' }}>
                No {filter === 'ALL' ? '' : `${filter.replace(/_/g, ' ').toLowerCase()} `}interviews yet.
              </p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                  color: 'hsl(220 15% 5%)',
                }}
              >
                <Play size={14} fill="hsl(220 15% 5%)" /> Start a New Interview
              </button>
            </div>
          ) : filtered.map((s) => (
            <motion.div
              key={s.id}
              whileHover={{ x: 4 }}
              transition={{ type: 'spring', stiffness: 300 }}
              onClick={() => navigate(`/interview/${s.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12,
                background: 'hsl(215 15% 9%)',
                border: '1px solid hsl(215 15% 14%)', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: `${modeColor[s.mode as InterviewMode] || modeColor.CODING}1a`,
                border: `1px solid ${modeColor[s.mode as InterviewMode] || modeColor.CODING}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mic size={17} color={modeColor[s.mode as InterviewMode] || modeColor.CODING} />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{
                  fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {s.role || 'Interview'} · {s.company}
                </p>
                <p style={{ fontSize: 12, color: 'hsl(210 10% 48%)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '2px 8px', borderRadius: 999,
                    color: modeColor[s.mode as InterviewMode] || modeColor.CODING,
                    background: `${modeColor[s.mode as InterviewMode] || modeColor.CODING}1a`,
                    border: `1px solid ${modeColor[s.mode as InterviewMode] || modeColor.CODING}35`,
                  }}>
                    {s.mode.replace(/_/g, ' ')}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '2px 8px', borderRadius: 999,
                    color: s.status === 'COMPLETED' ? 'hsl(142 70% 60%)'
                      : s.status === 'ACTIVE' ? 'hsl(174 85% 65%)'
                      : 'hsl(210 10% 45%)',
                    background: s.status === 'COMPLETED' ? 'hsl(142 70% 50% / 0.1)'
                      : s.status === 'ACTIVE' ? 'hsl(174 85% 60% / 0.1)'
                      : 'hsl(215 15% 13%)',
                  }}>
                    {s.status}
                  </span>
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? 10 : 18, flexShrink: 0 }}>
                {!isNarrow && typeof s.durationMs === 'number' && s.durationMs > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'hsl(210 10% 48%)' }}>
                    <Clock size={13} /> {Math.round(s.durationMs / 60000)}m
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 700, color: typeof s.score === 'number' ? scoreColor(s.score) : 'hsl(210 10% 40%)' }}>
                  <TrendingUp size={13} /> {typeof s.score === 'number' ? `${s.score}%` : '—'}
                </div>
                {!isNarrow && <ArrowRight size={15} color="hsl(210 10% 40%)" />}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
