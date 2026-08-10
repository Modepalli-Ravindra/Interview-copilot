import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText, UploadCloud, Loader2, Target, Sparkles, ArrowRight,
  CheckCircle2, AlertCircle, HelpCircle, BookOpen, Zap, TrendingUp,
} from 'lucide-react';
import type {
  ResumeProfile, JdProfile, MatchReport, ExtractedSkill, InterviewMode, InterviewDifficulty,
} from '../types';
import { apiFetch } from '../lib/api';

const MATCH_CONTEXT_KEY = 'interviewpilot_match_context';

const fadePage = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.35 },
};

const scoreColor = (s: number) =>
  s >= 80 ? 'hsl(142 70% 55%)' : s >= 60 ? 'hsl(35 90% 55%)' : 'hsl(0 85% 60%)';

function ScoreRing({ value }: { value: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const color = scoreColor(value);
  return (
    <div style={{ position: 'relative', width: 110, height: 110 }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="hsl(215 15% 16%)" strokeWidth={9} />
        <circle
          cx={55} cy={55} r={r} fill="none"
          stroke={color} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * value) / 100}
          transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--font-sans)' }}>{value}%</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(210 10% 70%)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'hsl(215 15% 15%)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 999, background: color }}
        />
      </div>
    </div>
  );
}

function SkillChip({ children, tone }: { children: React.ReactNode; tone: 'match' | 'partial' | 'missing' }) {
  const styles = {
    match: { color: 'hsl(142 70% 60%)', background: 'hsl(142 70% 50% / 0.1)', border: '1px solid hsl(142 70% 50% / 0.3)' },
    partial: { color: 'hsl(35 90% 62%)', background: 'hsl(35 90% 55% / 0.1)', border: '1px solid hsl(35 90% 55% / 0.3)' },
    missing: { color: 'hsl(0 85% 62%)', background: 'hsl(0 85% 55% / 0.1)', border: '1px solid hsl(0 85% 55% / 0.3)' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, padding: '5px 11px', borderRadius: 999, ...styles,
    }}>
      {children}
    </span>
  );
}

export default function MatchingPage() {
  const navigate = useNavigate();

  // Resume state
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState<{ fileName: string; text: string; profile: ResumeProfile | null; skills: ExtractedSkill[]; fileKey?: string | null; fileUrl?: string | null } | null>(null);
  const [resumePaste, setResumePaste] = useState('');
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);

  // JD state
  const jdInputRef = useRef<HTMLInputElement>(null);
  const [jd, setJd] = useState<{ fileName: string; text: string; profile: JdProfile | null } | null>(null);
  const [jdPaste, setJdPaste] = useState('');
  const [jdBusy, setJdBusy] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);

  // Match state
  const [match, setMatch] = useState<MatchReport | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('Medium');

  const canMatch = !!resume?.profile && !!jd?.profile;

  const uploadResumeFile = async (file: File) => {
    setResumeBusy(true);
    setResumeError(null);
    setResume(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/api/intelligence/resume', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Resume parsing failed');
      setResume({
        fileName: file.name,
        text: json.data.text,
        profile: json.data.profile,
        skills: json.data.skills,
        fileKey: json.data.resumeFileKey || null,
        fileUrl: json.data.resumeFileUrl || null,
      });
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Resume parsing failed');
    } finally {
      setResumeBusy(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  const parseResumePaste = async (text: string) => {
    if (!text.trim()) return;
    setResumeBusy(true);
    setResumeError(null);
    setResume(null);
    try {
      const res = await apiFetch('/api/intelligence/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Resume parsing failed');
      setResume({ fileName: 'Pasted resume', text: json.data.text, profile: json.data.profile, skills: json.data.skills, fileKey: null, fileUrl: null });
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Resume parsing failed');
    } finally {
      setResumeBusy(false);
    }
  };

  const uploadJdFile = async (file: File) => {
    setJdBusy(true);
    setJdError(null);
    setJd(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/api/intelligence/jd', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'JD parsing failed');
      setJd({ fileName: file.name, text: json.data.text, profile: json.data.profile });
    } catch (err) {
      setJdError(err instanceof Error ? err.message : 'JD parsing failed');
    } finally {
      setJdBusy(false);
      if (jdInputRef.current) jdInputRef.current.value = '';
    }
  };

  const parseJdPaste = async (text: string) => {
    if (!text.trim()) return;
    setJdBusy(true);
    setJdError(null);
    setJd(null);
    try {
      const res = await apiFetch('/api/intelligence/jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, company: company || 'Unknown' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'JD parsing failed');
      setJd({ fileName: 'Pasted JD', text: json.data.text, profile: json.data.profile });
    } catch (err) {
      setJdError(err instanceof Error ? err.message : 'JD parsing failed');
    } finally {
      setJdBusy(false);
    }
  };

  const analyzeMatch = async () => {
    if (!canMatch) return;
    setMatching(true);
    setMatchError(null);
    try {
      const res = await apiFetch('/api/intelligence/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeProfile: resume!.profile, jdProfile: jd!.profile }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Match analysis failed');
      setMatch(json.data.match);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Match analysis failed');
    } finally {
      setMatching(false);
    }
  };

  const startInterview = async (mode: InterviewMode) => {
    if (!resume?.text || !jd?.text || !jd.profile || !match) return;
    setStarting(true);
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          difficulty,
          role: role || jd.profile.role || 'Software Engineer',
          company: company || jd.profile.company || 'Company',
          resumeText: resume.text,
          jdText: jd.text,
          resumeProfileData: resume.profile,
          jdProfileData: jd.profile,
          matchReport: match,
          resumeFileKey: resume.fileKey || undefined,
          resumeFileUrl: resume.fileUrl || undefined,
          resumeFileName: resume.fileKey ? resume.fileName : undefined,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        navigate(`/interview/${json.data.id}`);
        return;
      }
      throw new Error(json.error || 'Failed to create session');
    } catch (err) {
      console.error('[Matching] start failed:', err);
      setMatchError('Failed to create the interview session. Please try again.');
      setStarting(false);
    }
  };

  const sendToInterviewSetup = () => {
    if (!resume || !jd || !jd.profile || !match) return;
    try {
      localStorage.setItem(MATCH_CONTEXT_KEY, JSON.stringify({
        resumeText: resume.text,
        resumeProfile: resume.profile,
        resumeFileKey: resume.fileKey || null,
        resumeFileUrl: resume.fileUrl || null,
        resumeFileName: resume.fileKey ? resume.fileName : null,
        jdText: jd.text,
        jdProfile: jd.profile,
        matchReport: match,
        role: role || jd.profile.role || '',
        company: company || jd.profile.company || '',
      }));
    } catch {
      /* localStorage unavailable — ignore */
    }
    navigate('/dashboard/interviews');
  };

  const resetAll = () => {
    setResume(null);
    setJd(null);
    setMatch(null);
    setMatchError(null);
  };

  return (
    <motion.div {...fadePage}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Resume vs JD
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Deterministic fit analysis — upload your resume and the job description, then run interviews on the match.
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
        {/* Resume */}
        <div style={{
          borderRadius: 14, padding: '18px', background: 'hsl(215 15% 9%)',
          border: resume ? '1px solid hsl(142 70% 50% / 0.4)' : '1px dashed hsl(215 15% 24%)',
        }}>
          <input ref={resumeInputRef} type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadResumeFile(f); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: resume ? 'hsl(142 70% 50% / 0.12)' : 'hsl(215 15% 13%)',
              border: `1px solid ${resume ? 'hsl(142 70% 50% / 0.3)' : 'hsl(215 15% 22%)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={17} color={resume ? 'hsl(142 70% 55%)' : 'hsl(210 10% 55%)'} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)' }}>Resume</p>
              <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>PDF, TXT or MD · parsed deterministically</p>
            </div>
          </div>

          {resumeBusy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                <Loader2 size={16} color="hsl(35 90% 60%)" />
              </motion.div>
              <span style={{ fontSize: 12.5, color: 'hsl(210 10% 60%)' }}>Parsing resume…</span>
            </div>
          ) : resume ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="hsl(142 70% 55%)" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(142 70% 60%)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {resume.fileName}
                </span>
                <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                  {resume.skills.length} skills
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {resume.skills.slice(0, 10).map(s => (
                  <span key={s.skill} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, color: 'hsl(210 10% 60%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                    {s.skill}
                  </span>
                ))}
                {resume.skills.length > 10 && (
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, color: 'hsl(210 10% 45%)' }}>
                    +{resume.skills.length - 10} more
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowResumePreview(v => !v)}
                style={{
                  alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'hsl(174 85% 70%)', fontFamily: 'var(--font-sans)',
                  fontSize: 11.5, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <Sparkles size={12} />
                {showResumePreview ? 'Hide extracted profile' : 'Preview extracted profile'}
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => resumeInputRef.current?.click()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                  background: 'hsl(174 85% 60% / 0.08)', color: 'hsl(174 85% 70%)',
                  border: '1px solid hsl(174 85% 60% / 0.3)',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                <UploadCloud size={15} /> Upload resume file
              </button>
              <textarea
                value={resumePaste}
                onChange={e => setResumePaste(e.target.value)}
                placeholder="…or paste resume text, then Apply"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', marginTop: 8, resize: 'vertical',
                  padding: '9px 11px', borderRadius: 8,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 12, lineHeight: 1.5, fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                onClick={() => parseResumePaste(resumePaste)}
                disabled={resumePaste.trim().length === 0}
                style={{
                  marginTop: 6, padding: '6px 12px', borderRadius: 7,
                  background: resumePaste.trim() ? 'hsl(174 85% 60% / 0.12)' : 'hsl(215 15% 12%)',
                  color: resumePaste.trim() ? 'hsl(174 85% 70%)' : 'hsl(210 10% 40%)',
                  border: '1px solid hsl(215 15% 20%)', cursor: resumePaste.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                Apply pasted resume
              </button>
            </div>
          )}
          {resumeError && <p style={{ fontSize: 11.5, color: 'hsl(0 85% 62%)', marginTop: 8 }}>{resumeError}</p>}
        </div>

        {/* JD */}
        <div style={{
          borderRadius: 14, padding: '18px', background: 'hsl(215 15% 9%)',
          border: jd ? '1px solid hsl(174 85% 60% / 0.4)' : '1px dashed hsl(215 15% 24%)',
        }}>
          <input ref={jdInputRef} type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadJdFile(f); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: jd ? 'hsl(174 85% 60% / 0.12)' : 'hsl(215 15% 13%)',
              border: `1px solid ${jd ? 'hsl(174 85% 60% / 0.3)' : 'hsl(215 15% 22%)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Target size={17} color={jd ? 'hsl(174 85% 60%)' : 'hsl(210 10% 55%)'} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'hsl(210 10% 85%)' }}>Job Description</p>
              <p style={{ fontSize: 11.5, color: 'hsl(210 10% 48%)' }}>PDF, TXT, MD or pasted text</p>
            </div>
          </div>

          {jdBusy ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                <Loader2 size={16} color="hsl(35 90% 60%)" />
              </motion.div>
              <span style={{ fontSize: 12.5, color: 'hsl(210 10% 60%)' }}>Parsing job description…</span>
            </div>
          ) : jd ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="hsl(174 85% 60%)" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(174 85% 70%)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {jd.fileName}
                </span>
                <span style={{ fontSize: 11, color: 'hsl(210 10% 45%)' }}>
                  {jd.profile?.requiredSkills.length ?? 0} required skills
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {jd.profile?.location && (
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                    {jd.profile.location}
                  </span>
                )}
                {jd.profile?.educationRequirements.map(e => (
                  <span key={e} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                    {e}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <button
                onClick={() => jdInputRef.current?.click()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                  background: 'hsl(174 85% 60% / 0.08)', color: 'hsl(174 85% 70%)',
                  border: '1px solid hsl(174 85% 60% / 0.3)',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                <UploadCloud size={15} /> Upload JD file
              </button>
              <textarea
                value={jdPaste}
                onChange={e => setJdPaste(e.target.value)}
                placeholder="…or paste the job description, then Apply"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', marginTop: 8, resize: 'vertical',
                  padding: '9px 11px', borderRadius: 8,
                  background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 82%)',
                  border: '1px solid hsl(215 15% 18%)', outline: 'none',
                  fontSize: 12, lineHeight: 1.5, fontFamily: 'var(--font-sans)',
                }}
              />
              <button
                onClick={() => parseJdPaste(jdPaste)}
                disabled={jdPaste.trim().length === 0}
                style={{
                  marginTop: 6, padding: '6px 12px', borderRadius: 7,
                  background: jdPaste.trim() ? 'hsl(174 85% 60% / 0.12)' : 'hsl(215 15% 12%)',
                  color: jdPaste.trim() ? 'hsl(174 85% 70%)' : 'hsl(210 10% 40%)',
                  border: '1px solid hsl(215 15% 20%)', cursor: jdPaste.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                Apply pasted JD
              </button>
            </div>
          )}
          {jdError && <p style={{ fontSize: 11.5, color: 'hsl(0 85% 62%)', marginTop: 8 }}>{jdError}</p>}
        </div>
      </div>

      {/* Extracted resume preview */}
      {showResumePreview && resume?.profile && (
        <ResumePreview profile={resume.profile} fileName={resume.fileName} />
      )}

      {/* Role / company / difficulty + analyze */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto',
        gap: 12, alignItems: 'center', marginBottom: 4,
      }}>
        <input
          value={role}
          onChange={e => setRole(e.target.value)}
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
          onChange={e => setCompany(e.target.value)}
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
          onChange={e => setDifficulty(e.target.value as InterviewDifficulty)}
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
        <button
          onClick={analyzeMatch}
          disabled={!canMatch || matching}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 10,
            background: canMatch && !matching
              ? 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))'
              : 'hsl(215 15% 14%)',
            border: 'none',
            color: canMatch && !matching ? 'hsl(220 15% 5%)' : 'hsl(210 10% 40%)',
            cursor: canMatch && !matching ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
          }}
        >
          {matching ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}><Loader2 size={15} /></motion.div> : <Zap size={15} fill={canMatch ? 'hsl(220 15% 5%)' : 'none'} />}
          {matching ? 'Analyzing…' : 'Analyze Match'}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'hsl(210 10% 45%)', marginTop: 8 }}>
        Scores are computed from real overlap (normalized skills, experience years, project technology usage, keyword density) — never guessed by an LLM.
      </p>
      {matchError && <p style={{ fontSize: 12.5, color: 'hsl(0 85% 62%)', marginTop: 10 }}>{matchError}</p>}

      {/* Results */}
      {match && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{ borderRadius: 18, padding: '26px', marginTop: 20 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Sparkles size={16} color="hsl(174 85% 65%)" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'hsl(210 10% 90%)' }}>Fit Report</h2>
            <button
              onClick={resetAll}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(210 10% 45%)', fontFamily: 'var(--font-sans)', fontSize: 12 }}
            >
              Start over
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <ScoreRing value={match.overallMatch} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(210 10% 55%)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Overall fit
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ScoreBar label="Skill match" value={match.skillMatch} />
              {match.experienceInsufficient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, background: 'hsl(35 90% 55% / 0.08)', border: '1px solid hsl(35 90% 55% / 0.25)' }}>
                  <HelpCircle size={14} color="hsl(35 90% 62%)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'hsl(210 10% 70%)', lineHeight: 1.4 }}>
                    <b style={{ color: 'hsl(35 90% 65%)' }}>Experience match</b> — not enough information to calculate
                    (no dated work history found or no formal years requirement stated).
                  </span>
                </div>
              ) : (
                <ScoreBar label="Experience match" value={match.experienceMatch} />
              )}
              <ScoreBar label="Project match" value={match.projectMatch} />
              <ScoreBar label="Keyword match" value={match.keywordMatch} />
            </div>
          </div>

          {/* Skill breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div style={{ borderRadius: 12, padding: '14px 16px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(142 70% 60%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} /> Matched ({match.matchedSkills.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {match.matchedSkills.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None</span> : match.matchedSkills.map(s => (
                  <SkillChip key={s.skill} tone="match">{s.skill}</SkillChip>
                ))}
              </div>
            </div>
            <div style={{ borderRadius: 12, padding: '14px 16px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(35 90% 60%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle size={13} /> Partial ({match.partiallyMatchedSkills.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {match.partiallyMatchedSkills.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None</span> : match.partiallyMatchedSkills.map(s => (
                  <SkillChip key={s.skill} tone="partial">{s.skill} <span style={{ opacity: 0.75 }}>via {s.relatedSkill}</span></SkillChip>
                ))}
              </div>
            </div>
            <div style={{ borderRadius: 12, padding: '14px 16px', background: 'hsl(215 15% 9%)', border: '1px solid hsl(215 15% 15%)' }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(0 85% 60%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> Missing ({match.missingSkills.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {match.missingSkills.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None</span> : match.missingSkills.map(s => (
                  <SkillChip key={s.skill} tone="missing">{s.skill}</SkillChip>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(142 70% 60%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={13} /> Strong areas
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {match.strongAreas.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None above 70%</span> : match.strongAreas.map(a => (
                  <div key={a.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'hsl(210 10% 70%)' }}>{a.category}</span>
                    <span style={{ fontWeight: 700, color: 'hsl(142 70% 60%)' }}>{a.score}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(0 85% 60%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> Weak areas
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {match.weakAreas.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None below 50%</span> : match.weakAreas.map(a => (
                  <div key={a.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'hsl(210 10% 70%)' }}>{a.category}</span>
                    <span style={{ fontWeight: 700, color: 'hsl(0 85% 60%)' }}>{a.score}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(174 85% 65%)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={13} /> Recommended preparation
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {match.preparationTopics.length === 0 ? <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>No gaps to prepare</span> : match.preparationTopics.map(t => (
                  <p key={t} style={{ fontSize: 12.5, color: 'hsl(210 10% 68%)', lineHeight: 1.45, paddingLeft: 12, borderLeft: '2px solid hsl(174 85% 60% / 0.4)' }}>
                    {t}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 18, borderTop: '1px solid hsl(215 15% 15%)' }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startInterview('JD_BASED')}
              disabled={starting}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 22px', borderRadius: 10,
                background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
                border: 'none', color: 'hsl(220 15% 5%)',
                cursor: starting ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
              }}
            >
              {starting ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}><Loader2 size={15} /></motion.div> : <PlayIcon />}
              {starting ? 'Starting…' : 'Run JD-based interview'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startInterview('RESUME_BASED')}
              disabled={starting}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 22px', borderRadius: 10,
                background: 'hsl(215 15% 12%)',
                border: '1px solid hsl(174 85% 60% / 0.35)',
                color: 'hsl(174 85% 70%)',
                cursor: starting ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}
            >
              <FileText size={15} /> Resume-based interview
            </motion.button>
            <button
              onClick={sendToInterviewSetup}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 22px', borderRadius: 10,
                background: 'none',
                border: '1px solid hsl(215 15% 24%)',
                color: 'hsl(210 10% 60%)',
                cursor: 'pointer',
                fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
              }}
            >
              Send to Interview setup <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function PlayIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="hsl(220 15% 5%)" aria-hidden="true">
      <path d="M8 5.14v13.72c0 .9.98 1.45 1.74.97l11-6.86a1.13 1.13 0 0 0 0-1.94l-11-6.86A1.13 1.13 0 0 0 8 5.14z" />
    </svg>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'hsl(174 85% 65%)', marginBottom: 8 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function ResumePreview({ profile, fileName }: { profile: ResumeProfile; fileName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ borderRadius: 14, padding: '18px', marginTop: 4, marginBottom: 16, background: 'hsl(215 15% 8%)', border: '1px solid hsl(215 15% 18%)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sparkles size={14} color="hsl(174 85% 65%)" />
        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'hsl(210 10% 88%)' }}>
          Extracted from resume{fileName ? ` · ${fileName}` : ''}
        </p>
        <p style={{ fontSize: 11, color: 'hsl(210 10% 45%)', marginLeft: 'auto' }}>
          All fields are deterministically extracted — nothing is AI-invented
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <PreviewSection title="Summary">
          <p style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5 }}>
            {profile.summary || <span style={{ color: 'hsl(210 10% 45%)' }}>No summary section detected</span>}
          </p>
        </PreviewSection>
        <PreviewSection title="Education">
          {profile.education.length === 0 && <p style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None detected</p>}
          {profile.education.map((e, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5 }}>
              {[e.degree, e.specialization, e.university, e.graduationYear, e.cgpa ? `CGPA ${e.cgpa}` : ''].filter(Boolean).join(' · ') || '—'}
            </p>
          ))}
        </PreviewSection>
        <PreviewSection title="Skills">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {profile.skills.length === 0 && <span style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None detected</span>}
            {profile.skills.slice(0, 24).map(s => (
              <span key={s} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, color: 'hsl(210 10% 62%)', background: 'hsl(215 15% 13%)', border: '1px solid hsl(215 15% 20%)' }}>
                {s}
              </span>
            ))}
          </div>
        </PreviewSection>
        <PreviewSection title="Experience">
          {profile.experience.length === 0 && profile.internships.length === 0 && (
            <p style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None detected</p>
          )}
          {[...profile.experience, ...profile.internships].slice(0, 6).map((w, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5, marginBottom: 6 }}>
              <b style={{ color: 'hsl(210 10% 85%)' }}>{[w.role, w.company].filter(Boolean).join(' at ')}</b>
              {w.duration && <span style={{ color: 'hsl(210 10% 48%)' }}> · {w.duration}</span>}
              {w.technologies.length > 0 && <span style={{ color: 'hsl(210 10% 48%)' }}> — {w.technologies.join(', ')}</span>}
            </p>
          ))}
        </PreviewSection>
        <PreviewSection title="Projects">
          {profile.projects.length === 0 && <p style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None detected</p>}
          {profile.projects.slice(0, 5).map((p, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5, marginBottom: 6 }}>
              <b style={{ color: 'hsl(210 10% 85%)' }}>{p.title}</b>
              {p.description && <span> — {p.description}</span>}
              {p.technologies.length > 0 && <span style={{ color: 'hsl(210 10% 48%)' }}> [{p.technologies.join(', ')}]</span>}
            </p>
          ))}
        </PreviewSection>
        <PreviewSection title="Certifications">
          {profile.certifications.length === 0 && <p style={{ fontSize: 12, color: 'hsl(210 10% 45%)' }}>None detected</p>}
          {profile.certifications.slice(0, 5).map((c, i) => (
            <p key={i} style={{ fontSize: 12.5, color: 'hsl(210 10% 70%)', lineHeight: 1.5 }}>
              {c.name}{c.issuer ? ` (${c.issuer})` : ''}{c.date ? ` · ${c.date}` : ''}
            </p>
          ))}
        </PreviewSection>
      </div>
    </motion.div>
  );
}
