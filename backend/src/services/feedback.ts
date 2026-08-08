/**
 * Feedback Report Generator — produces a structured end-of-interview report.
 *
 * Uses the AI Gateway when live; otherwise derives a deterministic report
 * from the *actual* session transcript (turn count, teaching episodes,
 * candidate verbosity), so even offline mode reflects the real session.
 */

import { createGatewaySession, sendGatewayMessage } from './aiGateway';

export interface FeedbackBreakdown {
  label: string;
  value: number;
}

export interface FeedbackGap {
  topic: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
}

export interface FeedbackReport {
  summary: string;
  score: number;
  breakdown: FeedbackBreakdown[];
  strengths: string[];
  gaps: FeedbackGap[];
  tips: string[];
  nextTopics: string[];
  generatedAt: string;
}

interface FeedbackInput {
  role: string;
  company: string;
  mode: string;
  transcript: Array<{ sender: string; text: string; timestamp?: string }>;
  analysis?: { summary?: string; strengths?: string[]; focusAreas?: string[] } | null;
}

// ──────────────────────────────────────────────────────────────
// Deterministic fallback — computed from the real transcript
// ──────────────────────────────────────────────────────────────

function deriveFromTranscript(input: FeedbackInput): FeedbackReport {
  const t = input.transcript || [];
  const interviewerTurns = t.filter((m) => m.sender === 'interviewer').length;
  const teachingEpisodes = t.filter((m) => m.sender === 'teaching');
  const candidateTurns = t.filter((m) => m.sender === 'candidate');
  const candidateWords = candidateTurns.reduce((sum, m) => sum + m.text.split(/\s+/).length, 0);
  const avgAnswerLength = candidateTurns.length ? Math.round(candidateWords / candidateTurns.length) : 0;

  const technical = Math.min(95, 62 + interviewerTurns * 3 - teachingEpisodes.length * 6);
  const communication = Math.min(95, 68 + (avgAnswerLength >= 25 ? 8 : 4) - (avgAnswerLength > 120 ? 10 : 0));
  const problemSolving = Math.min(95, technical - 3);
  const score = Math.max(40, Math.round((technical + communication + problemSolving) / 3));

  const strengths = (input.analysis?.strengths || []).slice(0, 2);
  if (candidateTurns.length >= 2) strengths.push('Consistent, structured communication');

  const gaps: FeedbackGap[] = teachingEpisodes.slice(0, 3).map((m) => ({
    topic: (m.text.split('\n')[0] || 'Concept explanation').replace('Not quite — ', '').slice(0, 48),
    severity: 'MEDIUM' as const,
    details: m.text.split('\n').find((l) => l.startsWith('Tip:'))?.replace('Tip:', '').trim() || 'Concept needs reinforcement.',
  }));
  if (avgAnswerLength > 120) {
    gaps.push({ topic: 'Answer conciseness', severity: 'LOW', details: `Answers averaged ${avgAnswerLength} words — tighten to ~60-90 for voice interviews.` });
  }
  if (gaps.length === 0) {
    gaps.push({ topic: 'Deeper trade-off reasoning', severity: 'LOW', details: 'Push further into why-you-chose-X style questions in your next session.' });
  }

  const tips = [
    'Name the trade-off explicitly in every technical answer.',
    'Anchor answers in the STAR shape: situation, task, action, result.',
    'Ask one clarifying question before diving into a design answer.',
  ];

  const nextTopics = (input.analysis?.focusAreas || []).slice(0, 3);
  if (nextTopics.length < 3) nextTopics.push('Trade-off reasoning', 'System design at scale');

  return {
    summary: `${input.role} interview (${input.mode}) at ${input.company} — ${interviewerTurns} questions over ${candidateTurns.length} answers. Strong areas held up well; ${gaps.length} gap${gaps.length > 1 ? 's' : ''} flagged for focused practice.`,
    score,
    breakdown: [
      { label: 'Technical', value: technical },
      { label: 'Communication', value: communication },
      { label: 'Problem Solving', value: problemSolving },
    ],
    strengths,
    gaps,
    tips,
    nextTopics,
    generatedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────
// AI generation
// ──────────────────────────────────────────────────────────────

function parseReport(raw: string): FeedbackReport | null {
  const cleaned = raw.trim().replace(/^```(json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    if (typeof obj.summary !== 'string' || typeof obj.score !== 'number') return null;
    const breakdown = Array.isArray(obj.breakdown)
      ? obj.breakdown
          .filter((b: any) => b && typeof b.label === 'string' && typeof b.value === 'number')
          .map((b: any) => ({ label: b.label, value: Math.max(0, Math.min(100, Math.round(b.value))) }))
      : [];
    const gaps = Array.isArray(obj.gaps)
      ? obj.gaps
          .filter((g: any) => g && typeof g.topic === 'string')
          .map((g: any) => ({
            topic: g.topic,
            severity: (['HIGH', 'MEDIUM', 'LOW'].includes(g.severity) ? g.severity : 'MEDIUM') as FeedbackGap['severity'],
            details: str(g.details),
          }))
      : [];
    return {
      summary: obj.summary,
      score: Math.max(0, Math.min(100, Math.round(obj.score))),
      breakdown: breakdown.length ? breakdown : [{ label: 'Technical', value: 75 }, { label: 'Communication', value: 75 }, { label: 'Problem Solving', value: 75 }],
      strengths: strArr(obj.strengths),
      gaps,
      tips: strArr(obj.tips),
      nextTopics: strArr(obj.nextTopics),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function generateFeedback(input: FeedbackInput): Promise<{ report: FeedbackReport; fromMock: boolean }> {
  const fallback = deriveFromTranscript(input);

  const session = await createGatewaySession('Feedback report');
  if (session.fromMock) {
    return { report: fallback, fromMock: true };
  }

  const transcriptBlock = input.transcript
    .map((m) => `[${m.sender}] ${m.text}`)
    .join('\n')
    .slice(0, 12000);

  const prompt = [
    `You are a senior technical interviewer. Write a feedback report for a ${input.role} interview (${input.mode}) at ${input.company}.`,
    ``,
    `<session_transcript>`,
    transcriptBlock,
    `</session_transcript>`,
    ``,
    `Return exactly one JSON object, no markdown:`,
    `{"summary":"<2-3 sentence honest assessment>","score":<0-100 number>,"breakdown":[{"label":"<Technical|Communication|Problem Solving>","value":<0-100 number>}],"strengths":["<2-3 grounded in the transcript>"],"gaps":[{"topic":"<short topic>","severity":"HIGH|MEDIUM|LOW","details":"<specific detail from the session>"}],"tips":["<2-3 actionable tips>"],"nextTopics":["<2-3 topics to study next>"]}`,
  ].join('\n');

  try {
    const completion = await sendGatewayMessage(session.gatewaySessionId, prompt);
    const report = parseReport(completion.text);
    if (!report) return { report: fallback, fromMock: true };
    return { report, fromMock: false };
  } catch (err) {
    console.warn('[Feedback] AI generation failed, using derived report:', (err as Error).message);
    return { report: fallback, fromMock: true };
  }
}
