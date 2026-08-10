/**
 * Feedback Report Generator — produces the end-of-interview report.
 *
 * Uses the AI Gateway when live; otherwise derives a deterministic report
 * from the *actual* session transcript (turn count, teaching episodes,
 * candidate verbosity, correlated weak answers), so even offline mode
 * reflects the real session.
 *
 * The report covers the full evaluation stack: overall score, per-dimension
 * breakdown, strong/weak answers, categorized gaps, coding performance,
 * concrete next-step recommendations, and explicit provenance metadata
 * (`feedbackSource` = ai | fallback | mock) so callers and the UI can never
 * confuse a derived report with a live-AI one.
 */

import { createGatewaySession, sendGatewayMessage } from './aiGateway';
import type { CodingInterviewReport } from './codingTypes';

export type FeedbackSource = 'ai' | 'fallback' | 'mock';

export interface FeedbackBreakdown {
  label: string;
  value: number;
}

export interface FeedbackGap {
  topic: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
  category?: 'technical' | 'resume' | 'jd' | 'project' | 'communication' | 'behavioral';
}

export interface CodingPerformance {
  problemTitle?: string;
  language?: string;
  /** Human-readable execution line: "8/10 tests passed" or "UNVERIFIED". */
  execution: string;
  status?: string;
  passedCount?: number;
  totalCount?: number;
  timeMs?: number | null;
  memoryKb?: number | null;
  /** False when Judge0 was unavailable — the report must never claim a pass. */
  verified: boolean;
  strengths: string[];
  weaknesses: string[];
  complexity?: string;
  recommendation: string[];
}

export interface FeedbackReport {
  summary: string;
  score: number;
  /** Full dimension breakdown (mode-dependent). */
  dimensions: FeedbackBreakdown[];
  /** Legacy alias (subset) — kept for backward compatibility. */
  breakdown: FeedbackBreakdown[];
  strengths: string[];
  gaps: FeedbackGap[];
  tips: string[];
  nextTopics: string[];
  strongAnswers: string[];
  weakAnswers: string[];
  recommendedCodingPractice: string[];
  recommendedInterviewQuestions: string[];
  betterAnswer?: string;
  codingPerformance?: CodingPerformance;
  /** What context was available when the report was generated. */
  contextUsed?: {
    resume: boolean;
    jd: boolean;
    skills: string[];
    github: boolean;
    difficulty?: string | null;
  };
  /** Provenance: 'ai' = live model output, 'fallback' = derived (AI output invalid), 'mock' = no AI provider. */
  feedbackSource: FeedbackSource;
  /** Server-computed coding-interview metrics + per-question report (Phase 5). */
  codingInterview?: CodingInterviewReport | null;
  provider?: string | null;
  model?: string | null;
  gateway?: string | null;
  fallbackReason?: string | null;
  generatedAt: string;
}

export interface CodingContext {
  problem?: { id?: string; title?: string; difficulty?: string; tags?: string[]; statement?: string };
  language?: string;
  submittedCode?: string;
  expectedComplexity?: string | null;
  execution?: {
    status?: string;
    passedCount?: number;
    totalCount?: number;
    timeMs?: number | null;
    memoryKb?: number | null;
    fromMock?: boolean;
    stderr?: string;
  };
}

export interface FeedbackInput {
  role: string;
  company: string;
  mode: string;
  difficulty?: string | null;
  transcript: Array<{ sender: string; text: string; timestamp?: string }>;
  analysis?: { summary?: string; strengths?: string[]; focusAreas?: string[] } | null;
  /** Structured resume profile summary (string). */
  resumeProfile?: string | null;
  /** Structured JD profile summary (string). */
  jdProfile?: string | null;
  /** Canonicalized skills list. */
  skills?: string[] | null;
  /** Deterministic resume<->JD match analysis summary. */
  matchSummary?: string | null;
  /** GitHub / project analysis summary (string), only when available. */
  githubAnalysis?: string | null;
  /** Coding session context (problem, code, execution results), only when available. */
  coding?: CodingContext | null;
  /** Server-computed coding-interview report (Phase 5). Numbers here are truth. */
  codingInterview?: CodingInterviewReport | null;
}

const HR_DIMENSIONS = [
  'Communication', 'Clarity', 'Confidence', 'Relevance', 'Structure',
  'Technical Credibility', 'Ownership', 'Problem Solving',
  'Honesty/Consistency', 'Conciseness',
];

const STANDARD_DIMENSIONS = [
  'Technical', 'Communication', 'Confidence', 'Problem Solving',
  'Project Knowledge', 'HR Readiness', 'Role Readiness',
];

const VAGUE_PATTERNS = [
  /\b(i don'?t know|i am not sure|i'm not sure|not sure|maybe|kind of|sort of|i guess|some stuff|stuff like that|worked fine|just used a database|no idea|it just worked|i do not remember)\b/i,
];

const TECH_TOKEN_RE =
  /\b(react|vue|angular|node|typescript|javascript|python|java|golang|\bgo\b|c\+\+|sql|postgres|postgresql|mysql|mongo|redis|kafka|rabbitmq|graphql|rest|api|aws|gcp|azure|docker|kubernetes|terraform|nginx|microservice|monolith|queue|index|cache|b-tree|idempoten|event|projection|trade-off|latency|throughput|scal|consisten|database)\b/i;

interface TranscriptMsg {
  sender: string;
  text: string;
}

interface DerivedWeakAnswer {
  question: string;
  answer: string;
  problem: string;
  improvement: string;
  category: FeedbackGap['category'];
}

// ──────────────────────────────────────────────────────────────
// Transcript helpers
// ──────────────────────────────────────────────────────────────

function messages(input: FeedbackInput): TranscriptMsg[] {
  return (input.transcript || []).filter(
    (m): m is TranscriptMsg => Boolean(m) && typeof m.text === 'string',
  );
}

function extractConcept(teachingText: string): string {
  const lines = teachingText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const leadIn = lines[0].match(/^Not quite\s*[—–-]?\s*(.*)$/i);
  if (leadIn) {
    const rest = leadIn[1].trim();
    // "Not quite — here's the core concept:" (or any colon-terminated lead-in)
    // means the actual concept is on the following line.
    if (/[:：]$/.test(rest)) return lines[1] || '';
    if (rest) return rest;
  }
  return lines[0];
}

function deriveProblem(teachingText: string): string {
  const concept = extractConcept(teachingText);
  if (!concept) return 'The answer missed the expected reasoning and concept.';
  if (/^the answer does not explain\b/i.test(concept)) return concept;
  return `The answer does not explain: ${concept}`;
}

function genericImprovement(teachingText: string): string {
  const tip = teachingText
    .split('\n')
    .find((l) => /^Tip:/i.test(l.trim()))
    ?.replace(/^Tip:\s*/i, '')
    .trim();
  if (tip) return tip;
  return 'Anchor the answer with a concrete example, name the trade-off, and give a measurable outcome.';
}

/** Associate each teaching turn with the candidate answer (and question) it follows. */
export function correlateWeakAnswers(t: TranscriptMsg[]): DerivedWeakAnswer[] {
  const out: DerivedWeakAnswer[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i].sender !== 'teaching') continue;
    let answer = '';
    let question = '';
    for (let j = i - 1; j >= 0; j--) {
      if (t[j].sender === 'candidate' && !answer) answer = t[j].text;
      if (t[j].sender === 'interviewer' && !question) question = t[j].text;
      if (answer && question) break;
    }
    const category: FeedbackGap['category'] =
      /honesty|self-awareness|weakness|interpersonal|conflict|teamwork/i.test(t[i].text)
        ? 'behavioral'
        : 'technical';
    out.push({
      question,
      answer,
      problem: deriveProblem(t[i].text),
      improvement: genericImprovement(t[i].text),
      category,
    });
  }
  return out;
}

function formatWeakAnswer(w: DerivedWeakAnswer): string {
  const lines: string[] = [];
  if (w.question) lines.push(`Question: ${w.question}`);
  if (w.answer) lines.push(`Candidate Answer: ${w.answer}`);
  lines.push(`Problem: ${w.problem}`);
  lines.push(`Improvement: ${w.improvement}`);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// Strong-answer scoring (deterministic, evidence-based)
// ──────────────────────────────────────────────────────────────

interface ScoredAnswer {
  text: string;
  score: number;
}

export function scoreAnswer(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 0;

  if (words >= 20 && words <= 90) score += 10;
  else if (words >= 12) score += 6;
  else if (words >= 8) score += 3;

  const techMatches = text.match(TECH_TOKEN_RE) || [];
  score += Math.min(14, techMatches.length * 2);

  if (/\d+\s*(%|ms|s\b|gb|mb|kb|users|req|requests|rps|seconds)/i.test(text)) score += 8;
  else if (/\d{1,3}(,\d{3})*(\.\d+)?\b/.test(text)) score += 4;

  if (/\b(i|we)\s+(built|owned|designed|architected|implemented|shipped|created|developed|led)\b/i.test(text)) score += 6;
  if (/\b(project|repo|repository|system|service|api|app)\b/i.test(text)) score += 3;

  const reasoning = text.match(/\b(because|which means|so that|as a result|therefore|this allowed|this let|by using|by doing|in order to)\b/i) || [];
  score += Math.min(6, reasoning.length * 2);

  if (VAGUE_PATTERNS.some((re) => re.test(text))) score -= 12;
  if (words < 8) score -= 8;
  if (words > 200) score -= 5;

  return score;
}

const STRONG_ANSWER_THRESHOLD = 14;

/**
 * Select strong answers deterministically. An answer followed by a teaching
 * turn is treated as weak and excluded. If confidence is low, returns [] —
 * it never falsely labels a weak answer as strong.
 */
export function selectStrongAnswers(t: TranscriptMsg[]): string[] {
  const candidates: ScoredAnswer[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i].sender !== 'candidate') continue;
    const next = t.slice(i + 1).find((m) => m.sender !== 'system');
    if (next && next.sender === 'teaching') continue;
    candidates.push({ text: t[i].text, score: scoreAnswer(t[i].text) });
  }
  const strong = candidates
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score >= STRONG_ANSWER_THRESHOLD)
    .slice(0, 2);
  if (strong.length === 0) return [];
  return strong.map((s) => s.text.slice(0, 280));
}

// ──────────────────────────────────────────────────────────────
// Question dedup
// ──────────────────────────────────────────────────────────────

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAskedQuestions(t: TranscriptMsg[]): string[] {
  const out: string[] = [];
  for (const m of t) {
    if (m.sender !== 'interviewer') continue;
    const q = m.text.trim();
    if (!q) continue;
    if (/generating your feedback|completes? the|that (covers|wraps|completes)/i.test(q)) continue;
    out.push(q.slice(0, 200));
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Coding performance (server-computed execution truth)
// ──────────────────────────────────────────────────────────────

export function buildCodingPerformance(coding?: CodingContext | null): CodingPerformance | undefined {
  if (!coding || !coding.execution) return undefined;
  const ex = coding.execution;
  const verified = !ex.fromMock && ex.totalCount != null;
  const total = ex.totalCount; // narrowed, may be undefined

  let execution: string;
  if (ex.fromMock) execution = 'UNVERIFIED';
  else if (ex.totalCount != null) execution = `${ex.passedCount ?? 0}/${ex.totalCount} tests passed`;
  else execution = ex.status ? String(ex.status).replace(/_/g, ' ') : 'UNVERIFIED';

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendation: string[] = [];

  if (verified && total != null) {
    if ((ex.passedCount ?? 0) === total) {
      strengths.push('All visible test cases passed.');
    } else {
      weaknesses.push(`Failed ${total - (ex.passedCount ?? 0)} of ${total} tests.`);
    }
  } else {
    weaknesses.push('Execution could not be verified (Judge0 unavailable).');
  }
  if (coding.problem?.tags?.length) {
    recommendation.push(`Re-solve "${coding.problem.title || 'the problem'}" and review: ${coding.problem.tags.slice(0, 3).join(', ')}.`);
  }
  if (coding.language) {
    recommendation.push(`Practice time-boxed ${coding.language} solves that stress edge cases and input validation.`);
  }
  if (recommendation.length === 0) recommendation.push('Re-solve problems you missed and time-box them.');

  return {
    problemTitle: coding.problem?.title,
    language: coding.language,
    execution,
    status: ex.status,
    passedCount: verified ? ex.passedCount ?? 0 : undefined,
    totalCount: verified ? total : undefined,
    timeMs: verified ? ex.timeMs ?? null : null,
    memoryKb: verified ? ex.memoryKb ?? null : null,
    verified,
    strengths,
    weaknesses,
    complexity: coding.expectedComplexity || undefined,
    recommendation,
  };
}

function deriveCodingPractice(input: FeedbackInput): string[] {
  const coding = input.coding;
  if (coding?.execution && !coding.execution.fromMock && coding.execution.totalCount) {
    const items: string[] = [];
    const missed = coding.execution.totalCount - (coding.execution.passedCount ?? 0);
    if (missed > 0) items.push(`Reproduce the ${missed} failing test case(s) locally and trace the input before fixing the code.`);
    if (coding.problem?.title) items.push(`Re-solve "${coding.problem.title}" and hunt edge cases in its core topics.`);
    if (coding.language) items.push(`Time-box ${coding.language} solutions and verify edge cases before running.`);
    if (items.length) return items.slice(0, 3);
  }
  return [
    'Re-solve problems you missed and time-box them',
    'Practice edge-case hunting on arrays/strings',
    'Write solutions by hand before typing',
  ];
}

// ──────────────────────────────────────────────────────────────
// Deterministic fallback — computed from the real transcript
// ──────────────────────────────────────────────────────────────

function summarizeTopic(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').replace(/["']/g, '');
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

/**
 * Overlay the server-computed coding-interview results onto a report.
 * The deterministic metrics (score, topics) replace the AI/transcript
 * heuristics whenever a coding interview took place, so the report always
 * reflects the actual execution truth — the returned object is authoritative.
 */
export function applyCodingInterviewDerived(report: FeedbackReport, r: CodingInterviewReport | null | undefined): FeedbackReport {
  if (!r) return report;
  const m = r.metrics;
  const reportHasAttempts = r.questions.some((q) => q.attempts > 0);
  const verified = r.hasVerifiedExecution;

  const strengths = [...report.strengths];
  if (m.masteredTopics.length) {
    strengths.push(`Verified mastery in: ${m.masteredTopics.slice(0, 3).join(', ')}`);
  } else if (m.questionsSolved > 0) {
    strengths.push(`Solved ${m.questionsSolved} coding question${m.questionsSolved > 1 ? 's' : ''} with passing tests.`);
  }
  const codingStrength = verified
    ? `Passed ${m.totalTestsPassed}/${m.totalTests} tests across ${m.questionsAttempted} coding question${m.questionsAttempted === 1 ? '' : 's'}.`
    : `${m.questionsAttempted} coding question${m.questionsAttempted === 1 ? '' : 's'} attempted (execution unverified).`;
  if (reportHasAttempts) strengths.push(codingStrength);

  const gaps = [...report.gaps];
  for (const topic of m.practiceTopics.slice(0, 3)) {
    if (!gaps.some((g) => g.topic.toLowerCase().includes(topic.toLowerCase()))) {
      gaps.push({ topic, severity: 'MEDIUM', category: 'technical', details: `Missed or struggled with ${topic} during the coding interview.` });
    }
  }
  if (verified && m.totalTests > 0 && m.totalTestsPassed < m.totalTests && !gaps.some((g) => g.details.includes('test'))) {
    gaps.push({ topic: 'Test coverage', severity: 'MEDIUM', category: 'technical', details: `Failed ${m.totalTests - m.totalTestsPassed} of ${m.totalTests} tests — hunt edge cases before submitting.` });
  }

  const tips = [...report.tips];
  if (!verified && reportHasAttempts) {
    tips.unshift('Judge0 was unavailable during this session — re-run your solutions locally to confirm correctness.');
  }
  if (m.averageAttempts > 1.5) {
    tips.unshift(`Averaged ${m.averageAttempts} submissions per question — dry-run your logic before hitting "Run".`);
  }

  const nextTopics = Array.from(new Set([...m.practiceTopics, ...report.nextTopics])).slice(0, 4);

  const recommendedCodingPractice = [
    ...m.practiceTopics.slice(0, 2).map((t) => `Re-solve ${t} problems and verify edge cases before running.`),
    ...(verified && m.totalTests > m.totalTestsPassed
      ? ['Reproduce each failing test locally and trace the input before fixing the code.']
      : []),
    `Time-box ${r.language} solutions and verify edge cases before running.`,
  ].slice(0, 3);

  return {
    ...report,
    score: m.overallScore,
    dimensions: [
      ...report.dimensions.filter((d) => d.label !== 'Coding'),
      { label: 'Coding', value: m.overallScore },
    ],
    strengths,
    gaps,
    tips,
    nextTopics,
    recommendedCodingPractice,
    codingInterview: r,
  };
}

function deriveInterviewQuestions(input: FeedbackInput, gaps: FeedbackGap[], t: TranscriptMsg[]): string[] {
  const asked = new Set(extractAskedQuestions(t).map(normalizeQuestion));
  const items: string[] = [];
  const weak = correlateWeakAnswers(t);

  for (const w of weak.slice(0, 2)) {
    if (w.category === 'behavioral') {
      const q = `Describe a time you handled ${w.answer ? summarizeTopic(w.answer).toLowerCase() : 'a difficult situation'} — structure it with the STAR method.`;
      if (!asked.has(normalizeQuestion(q))) items.push(q);
    } else if (w.answer) {
      const q = `How would you handle "${summarizeTopic(w.answer)}" in a real system — walk through the trade-offs?`;
      if (!asked.has(normalizeQuestion(q))) items.push(q);
    }
  }

  for (const g of gaps) {
    if (items.length >= 2) break;
    const q = `Practice explaining ${g.topic.toLowerCase()} with a concrete example and a measurable outcome.`;
    if (!asked.has(normalizeQuestion(q))) items.push(q);
  }

  const generic = [
    'Trade-off questions for your top 3 technologies',
    'Project deep-dive questions on your own repos',
    'System design: design the app you built at scale',
  ];
  for (const g of generic) {
    if (items.length >= 3) break;
    if (!asked.has(normalizeQuestion(g))) items.push(g);
  }
  return items.slice(0, 3);
}

function deriveFromTranscript(
  input: FeedbackInput,
  meta: { source: 'fallback' | 'mock'; reason: string },
): FeedbackReport {
  const t = messages(input);
  const interviewerTurns = t.filter((m) => m.sender === 'interviewer').length;
  const teachingTurns = t.filter((m) => m.sender === 'teaching').length;
  const candidateTurns = t.filter((m) => m.sender === 'candidate');
  const candidateWords = candidateTurns.reduce((sum, m) => sum + m.text.split(/\s+/).length, 0);
  const avgAnswerLength = candidateTurns.length ? Math.round(candidateWords / candidateTurns.length) : 0;

  const technical = Math.min(95, 62 + interviewerTurns * 3 - teachingTurns * 6);
  const communication = Math.min(95, 68 + (avgAnswerLength >= 25 ? 8 : 4) - (avgAnswerLength > 120 ? 10 : 0));
  const problemSolving = Math.min(95, technical - 3);
  const confidence = Math.min(95, communication - 2 + (teachingTurns ? -5 : 2));
  const projectKnowledge = Math.min(95, 55 + interviewerTurns * 2 - teachingTurns * 4);
  const hrReadiness = Math.min(95, communication + (candidateTurns.length >= 3 ? 3 : -5));
  const roleReadiness = Math.round((technical + projectKnowledge + hrReadiness) / 3);

  const dimensions = input.mode === 'HR'
    ? HR_DIMENSIONS.map((label, i) => ({
        label,
        value: Math.max(45, Math.min(95, technical - i + (label === 'Conciseness' && avgAnswerLength > 120 ? -8 : 0) + (label === 'Communication' ? 5 : 0))),
      }))
    : STANDARD_DIMENSIONS.map((label) => {
        const base =
          label === 'Technical' ? technical
          : label === 'Communication' ? communication
          : label === 'Confidence' ? confidence
          : label === 'Problem Solving' ? problemSolving
          : label === 'Project Knowledge' ? projectKnowledge
          : label === 'HR Readiness' ? hrReadiness
          : roleReadiness;
        return { label, value: base };
      });

  const score = Math.max(40, Math.round(dimensions.reduce((s, d) => s + d.value, 0) / dimensions.length));

  const strengths = (input.analysis?.strengths || []).slice(0, 2);
  if (candidateTurns.length >= 2) strengths.push('Consistent, structured communication');

  // Gaps from correlated weak answers — never from teaching text alone.
  const weak = correlateWeakAnswers(t);
  const gaps: FeedbackGap[] = weak.slice(0, 3).map((w) => ({
    topic: w.answer ? summarizeTopic(w.answer) : w.question ? summarizeTopic(w.question) : 'Concept gap',
    severity: 'MEDIUM' as const,
    category: w.category,
    details: `${w.problem} ${w.improvement}`.trim(),
  }));
  if (avgAnswerLength > 120) {
    gaps.push({ topic: 'Answer conciseness', severity: 'LOW', category: 'communication', details: `Answers averaged ${avgAnswerLength} words — tighten to ~60-90 for voice interviews.` });
  }
  if (gaps.length === 0) {
    gaps.push({ topic: 'Deeper trade-off reasoning', severity: 'LOW', category: 'technical', details: 'Push further into why-you-chose-X style questions in your next session.' });
  }

  const tips = [
    'Name the trade-off explicitly in every technical answer.',
    'Anchor answers in the STAR shape: situation, task, action, result.',
    'Ask one clarifying question before diving into a design answer.',
  ];

  const nextTopics = (input.analysis?.focusAreas || []).slice(0, 3);
  if (nextTopics.length < 3) nextTopics.push('Trade-off reasoning', 'System design at scale');

  const strongAnswers = selectStrongAnswers(t);
  const weakAnswers = weak.slice(0, 2).map(formatWeakAnswer);
  const recommendedCodingPractice = deriveCodingPractice(input);
  const recommendedInterviewQuestions = deriveInterviewQuestions(input, gaps, t);

  let betterAnswer: string | undefined;
  if (input.mode === 'HR' && weak.length) {
    const w = weak[0];
    betterAnswer = [
      `Improve your answer to "${w.question || 'the question'}" directly instead of deflecting.`,
      w.problem,
      w.improvement,
      'Ground your response with a specific personal example and a measurable outcome.',
    ].join(' ');
  }

  const codingPerformance = buildCodingPerformance(input.coding);

  return applyCodingInterviewDerived({
    summary: `${input.role} interview (${input.mode}) at ${input.company} — ${interviewerTurns} questions over ${candidateTurns.length} answers. Strong areas held up well; ${gaps.length} gap${gaps.length > 1 ? 's' : ''} flagged for focused practice.`,
    score,
    dimensions,
    breakdown: dimensions.slice(0, 3),
    strengths,
    gaps,
    tips,
    nextTopics,
    strongAnswers,
    weakAnswers,
    recommendedCodingPractice,
    recommendedInterviewQuestions,
    betterAnswer,
    codingPerformance,
    feedbackSource: meta.source,
    provider: null,
    model: null,
    gateway: null,
    fallbackReason: meta.reason,
    generatedAt: new Date().toISOString(),
  }, input.codingInterview);
}

// ──────────────────────────────────────────────────────────────
// AI generation
// ──────────────────────────────────────────────────────────────

function dimensionLabels(mode: string): string[] {
  if (mode === 'HR') return HR_DIMENSIONS;
  if (mode === 'MIXED') return [...STANDARD_DIMENSIONS];
  return STANDARD_DIMENSIONS;
}

function betterAnswerGuide(mode: string): string {
  switch (mode) {
    case 'HR':
      return 'Rewrite the weakest HR answer into a stronger version. It must be grounded in the candidate\'s actual response, the actual question, their resume, and the job description — never a generic sample unrelated to what the candidate said.';
    case 'TECHNICAL':
      return 'Suggest how to improve the weakest technical explanation: restructure the reasoning, name the trade-offs, and clarify with a concrete example.';
    case 'PROJECT':
      return 'Suggest how to improve the weakest project explanation: be specific about your role, the decisions you made, the trade-offs, and measurable outcomes.';
    case 'BEHAVIORAL':
      return 'Suggest how to structure the weakest behavioral answer better using the STAR format, with a specific example and a measurable result.';
    case 'SYSTEM_DESIGN':
      return 'Suggest how to improve the weakest design answer: clarify requirements, capacity reasoning, and trade-offs.';
    default:
      return 'Suggest how to improve the weakest answer, staying grounded in the candidate\'s actual response and the question asked.';
  }
}

function contextBlock(input: FeedbackInput): string[] {
  const lines: string[] = [];
  if (input.resumeProfile && input.resumeProfile.trim()) {
    lines.push('', '<structured_resume_profile>', input.resumeProfile, '</structured_resume_profile>');
  }
  if (input.jdProfile && input.jdProfile.trim()) {
    lines.push('', '<structured_jd_profile>', input.jdProfile, '</structured_jd_profile>');
  }
  if (Array.isArray(input.skills) && input.skills.length) {
    lines.push('', '<normalized_skills>', input.skills.slice(0, 40).join(', '), '</normalized_skills>');
  }
  if (input.githubAnalysis && input.githubAnalysis.trim()) {
    lines.push('', '<github_analysis>', input.githubAnalysis.slice(0, 8000), '</github_analysis>');
  }
  if (input.matchSummary && input.matchSummary.trim()) {
    lines.push('', '<match_analysis>', input.matchSummary.slice(0, 3000), '</match_analysis>');
  }
  return lines;
}

function codingBlock(coding?: CodingContext | null): string[] {
  if (!coding) return [];
  const lines: string[] = ['', '<coding_session>'];
  if (coding.problem?.title) {
    lines.push(`Problem: ${coding.problem.title}${coding.problem.difficulty ? ` (${coding.problem.difficulty})` : ''}`);
  }
  if (coding.problem?.statement) lines.push(`Problem statement:\n${coding.problem.statement.slice(0, 1200)}`);
  if (coding.language) lines.push(`Language: ${coding.language}`);
  if (coding.expectedComplexity) lines.push(`Expected complexity: ${coding.expectedComplexity}`);
  if (coding.submittedCode) lines.push(`Candidate code:\n${coding.submittedCode.slice(0, 4000)}`);
  if (coding.execution) {
    const ex = coding.execution;
    if (ex.fromMock) {
      lines.push('Execution: UNVERIFIED (Judge0 unavailable). Do NOT claim tests passed.');
    } else if (ex.totalCount != null) {
      lines.push(`Execution: ${ex.passedCount ?? 0}/${ex.totalCount} tests passed. Use exactly these numbers — never invent others.`);
    } else if (ex.status) {
      lines.push(`Execution status: ${String(ex.status).replace(/_/g, ' ')}`);
    }
    if (ex.stderr) lines.push(`Execution stderr:\n${ex.stderr.slice(0, 800)}`);
  }
  lines.push('Hidden test cases are NOT included. Never reference hidden test case contents.');
  lines.push('</coding_session>');
  return lines;
}

function codingInterviewBlock(r?: CodingInterviewReport | null): string[] {
  if (!r) return [];
  const m = r.metrics;
  const lines: string[] = [
    '',
    '<coding_interview>',
    `Questions attempted: ${m.questionsAttempted}; solved: ${m.questionsSolved}; overall score: ${m.overallScore}/100.`,
    `Verified test results: ${m.totalTestsPassed}/${m.totalTests} passed (${m.hiddenTestsPassed}/${m.hiddenTests} hidden).`,
    `Average attempts per question: ${m.averageAttempts}; average time: ${m.averageTimeMs}ms.`,
    `Mastered topics: ${m.masteredTopics.join(', ') || '(none)'}; practice topics: ${m.practiceTopics.join(', ') || '(none)'}.`,
  ];
  if (r.hasVerifiedExecution) {
    lines.push('Execution was verified by the judge. Use these numbers exactly — never invent test counts.');
  } else {
    lines.push('Execution was NOT verified (offline fallback). Do NOT claim tests passed or compute pass-rate-based conclusions.');
  }
  for (const q of r.questions) {
    lines.push(
      `Question: ${q.title} (${q.difficulty}, ${q.topic}) — status: ${q.status}; attempts: ${q.attempts}; hints: ${q.hintsUsed}; ` +
        `tests: ${q.passedCount}/${q.totalCount} passed${q.fromMock ? ' [UNVERIFIED]' : ''}; classification: ${q.classification}.`,
    );
  }
  lines.push('</coding_interview>');
  return lines;
}

function safeParse(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let text = match[0];
  const attempts = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/,\s*([}\]])/g, '$1')),
    () => JSON.parse(text.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try next repair strategy */
    }
  }
  return null;
}

function parseCodingPerformance(v: unknown, server: CodingPerformance | undefined): CodingPerformance | undefined {
  if (!server) return undefined;
  const obj = v && typeof v === 'object' ? v : null;
  const strArr = (val: unknown): string[] =>
    Array.isArray(val) ? val.filter((x): x is string => typeof x === 'string') : [];
  const str = (val: unknown): string | undefined => (typeof val === 'string' && val ? val : undefined);
  return {
    ...server,
    strengths: obj ? strArr((obj as any).strengths) : server.strengths,
    weaknesses: obj ? strArr((obj as any).weaknesses) : server.weaknesses,
    complexity: obj ? str((obj as any).complexity) : server.complexity,
    recommendation: obj ? strArr((obj as any).recommendation) : server.recommendation,
  };
}

/**
 * Parse + validate the AI's report JSON. `summary`, `score`, and `dimensions`
 * are required. Safe repair attempts run first (trailing commas, stray control
 * chars). Returns null when the output is not usable.
 */
function parseReport(raw: string, serverCoding?: CodingPerformance | null): FeedbackReport | null {
  const obj = safeParse(raw);
  if (!obj) return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const summary = str(obj.summary);
  const scoreRaw = obj.score;
  if (!summary || typeof scoreRaw !== 'number' || !isFinite(scoreRaw)) return null;

  const parseDims = (v: unknown): FeedbackBreakdown[] =>
    Array.isArray(v)
      ? v
          .filter((b: any) => b && typeof b.label === 'string' && typeof b.value === 'number')
          .map((b: any) => ({ label: b.label, value: Math.max(0, Math.min(100, Math.round(b.value))) }))
      : [];
  let dimensions = parseDims(obj.dimensions);
  if (dimensions.length === 0) dimensions = parseDims(obj.breakdown); // safe repair
  if (dimensions.length === 0) return null; // dimensions are required
  const breakdown = parseDims(obj.breakdown);
  const gaps = Array.isArray(obj.gaps)
    ? obj.gaps
        .filter((g: any) => g && typeof g.topic === 'string')
        .map((g: any) => ({
          topic: g.topic,
          severity: (['HIGH', 'MEDIUM', 'LOW'].includes(g.severity) ? g.severity : 'MEDIUM') as FeedbackGap['severity'],
          category: (['technical', 'resume', 'jd', 'project', 'communication', 'behavioral'].includes(g.category) ? g.category : undefined) as FeedbackGap['category'],
          details: str(g.details),
        }))
    : [];

  return {
    summary,
    score: Math.max(0, Math.min(100, Math.round(scoreRaw))),
    dimensions,
    breakdown: breakdown.length ? breakdown : dimensions.slice(0, 3),
    strengths: strArr(obj.strengths),
    gaps,
    tips: strArr(obj.tips),
    nextTopics: strArr(obj.nextTopics),
    strongAnswers: strArr(obj.strongAnswers),
    weakAnswers: strArr(obj.weakAnswers),
    recommendedCodingPractice: strArr(obj.recommendedCodingPractice),
    recommendedInterviewQuestions: strArr(obj.recommendedInterviewQuestions),
    betterAnswer: str(obj.betterAnswer) || undefined,
    codingPerformance: parseCodingPerformance(obj.codingPerformance, serverCoding || undefined),
    feedbackSource: 'ai' as const,
    provider: null,
    model: null,
    gateway: null,
    fallbackReason: null,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateFeedback(input: FeedbackInput): Promise<{ report: FeedbackReport; fromMock: boolean }> {
  const serverCoding = buildCodingPerformance(input.coding);
  const contextUsed = {
    resume: Boolean(input.resumeProfile && input.resumeProfile.trim()),
    jd: Boolean(input.jdProfile && input.jdProfile.trim()),
    skills: Array.isArray(input.skills) ? input.skills.slice(0, 40) : [],
    github: Boolean(input.githubAnalysis && input.githubAnalysis.trim()),
    match: Boolean(input.matchSummary && input.matchSummary.trim()),
    difficulty: input.difficulty || null,
  };
  const attachContext = (r: FeedbackReport): FeedbackReport => {
    r.contextUsed = contextUsed;
    return r;
  };

  const session = await createGatewaySession('Feedback report');
  if (session.fromMock) {
    return {
      report: attachContext(deriveFromTranscript(input, { source: 'mock', reason: 'AI provider unavailable' })),
      fromMock: true,
    };
  }

  const t = messages(input);
  const transcriptBlock = t
    .map((m) => `[${m.sender}] ${m.text}`)
    .join('\n')
    .slice(0, 14000);

  const isHr = input.mode === 'HR';
  const dims = dimensionLabels(input.mode);
  const askedQuestions = extractAskedQuestions(t);

  const prompt = [
    `You are a senior interviewer and HR evaluator. Write a feedback report for a ${input.role} interview (${input.mode}) at ${input.company}.`,
    ``,
    `<session_context>`,
    `Role: ${input.role}`,
    `Company: ${input.company}`,
    `Mode: ${input.mode}`,
    ...(input.difficulty ? [`Difficulty: ${input.difficulty}`] : []),
    `</session_context>`,
    ...contextBlock(input),
    ...codingBlock(input.coding),
    ...codingInterviewBlock(input.codingInterview),
    ``,
    `<session_transcript>`,
    transcriptBlock,
    `</session_transcript>`,
    ``,
    isHr
      ? `Evaluate these HR dimensions: ${dims.join(', ')}. Evaluate honestly from the transcript only. Provide strengths and weaknesses grounded in actual answers.`
      : `Evaluate these dimensions: ${dims.join(', ')}.`,
    ``,
    `<already_asked_questions>`,
    askedQuestions.length ? askedQuestions.join('\n') : '(none yet)',
    `</already_asked_questions>`,
    ``,
    `When recommending interview questions to practice, DO NOT recommend any question that is semantically similar to the questions above. Normalize questions by ignoring punctuation, capitalization, and wording. Treat trivial rewordings as duplicates (e.g. "Explain JWT authentication." and "How does JWT authentication work?" are the same question).`,
    ``,
    betterAnswerGuide(input.mode),
    ``,
    `Return exactly one JSON object, no markdown:`,
    `{"summary":"<2-3 sentence honest assessment>","score":<0-100 number>,"dimensions":[{"label":"<dimension>","value":<0-100 number>}],"breakdown":[{"label":"<Technical|Communication|Problem Solving>","value":<0-100 number>}],"strengths":["<2-3 grounded in the transcript>"],"gaps":[{"topic":"<short topic>","severity":"HIGH|MEDIUM|LOW","category":"technical|resume|jd|project|communication|behavioral","details":"<specific detail from the session>"}],"tips":["<2-3 actionable tips>"],"nextTopics":["<2-3 topics to study next>"],"strongAnswers":["<quote/paraphrase the 1-2 best candidate answers, grounded in the transcript>"],"weakAnswers":["<for each of the 1-2 weakest answers use this format: Question: <question>\\nCandidate Answer: <what the candidate actually said>\\nProblem: <what was wrong>\\nImprovement: <how to improve>"]${input.coding ? ',"codingPerformance":{"strengths":["<1-2 grounded in the code and execution>"],"weaknesses":["<1-2>"],"complexity":"<actual complexity if inferable from the code>","recommendation":["<2-3 concrete practice items>"]}' : ''},"recommendedCodingPractice":["<coding practice items tied to actual gaps>"],"recommendedInterviewQuestions":["<2-3 practice questions, NONE similar to already-asked questions>"],"betterAnswer":"<${betterAnswerGuide(input.mode)}>"}`,
  ].join('\n');

  try {
    const completion = await sendGatewayMessage(session.gatewaySessionId, prompt);
    let report = parseReport(completion.text, serverCoding);
    if (!report) {
      console.warn('[Feedback] AI returned unusable JSON; using derived report.');
      return {
        report: attachContext(deriveFromTranscript(input, { source: 'fallback', reason: 'AI returned invalid or malformed JSON' })),
        fromMock: true,
      };
    }
    if (input.codingInterview) {
      // Server-computed coding metrics are authoritative: they override the
      // AI's score/dimensions so the report can never present a non-server
      // number for coding performance.
      report = applyCodingInterviewDerived(report, input.codingInterview);
    }
    report.feedbackSource = 'ai';
    report.provider = completion.provider ?? null;
    report.model = completion.model ?? null;
    report.gateway = session.provider ?? null;
    report.codingInterview = input.codingInterview ?? null;
    return { report: attachContext(report), fromMock: false };
  } catch (err) {
    console.warn('[Feedback] AI generation failed, using derived report:', (err as Error).message);
    return {
      report: attachContext(deriveFromTranscript(input, { source: 'fallback', reason: `AI request failed: ${(err as Error).message}` })),
      fromMock: true,
    };
  }
}
