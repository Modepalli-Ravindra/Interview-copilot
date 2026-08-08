/**
 * Interview Engine — drives a live, resume-personalized interview.
 *
 * Talks to the AI Gateway (OpenCode serve) for every question, evaluation,
 * and teaching turn. When the gateway is in mock mode (server unreachable),
 * it replays a deterministic built-in flow so the app stays usable offline.
 */

import {
  createGatewaySession,
  sendGatewayMessage,
  parseInterviewTurn,
  type GatewaySession,
} from './aiGateway';

export type InterviewMode = 'CODING' | 'TECHNICAL' | 'BEHAVIORAL' | 'SYSTEM_DESIGN' | 'PROJECT';

export interface InterviewContext {
  sessionId: string;
  mode: InterviewMode;
  role: string;
  company: string;
  resumeText: string;
  jdText?: string;
  githubSummary?: string;
  /** Optional per-session turn cap (default 8). */
  maxTurns?: number;
}

export interface InterviewState extends InterviewContext {
  gateway: GatewaySession;
  transcript: Array<{ sender: string; text: string; timestamp: string }>;
  turnCount: number;
  maxTurns: number;
  completed: boolean;
  analysis: { summary: string; strengths: string[]; focusAreas: string[] } | null;
}

const MODE_PERSONAS: Record<InterviewMode, string> = {
  CODING: 'a Lead Software Engineer running a live coding interview. Evaluate data structures, algorithms, edge cases, and complexity. Guide with hints, never write the solution.',
  TECHNICAL: 'a Senior Staff Engineer probing deep technical knowledge, trade-offs, and real-world engineering judgment across the candidate\'s domain.',
  BEHAVIORAL: 'a Senior Talent Partner running a behavioral interview using the STAR method. Evaluate collaboration, conflict resolution, and ownership.',
  SYSTEM_DESIGN: 'a Principal Architect evaluating scalable, fault-tolerant system design. Probe trade-offs like consistency vs latency, SQL vs NoSQL.',
  PROJECT: 'a Staff Engineer reviewing the candidate\'s past projects in depth — architecture choices, challenges, and measurable outcomes.',
};

// What the interviewer weighs when evaluating each answer (kept private from
// the candidate; the engine only references it to make scoring consistent).
const MODE_RUBRICS: Record<InterviewMode, string> = {
  CODING: 'Correctness and edge cases, time/space complexity, data-structure choice, clarity of approach, and how well the candidate communicates reasoning while coding. Prefer probing hints over passing verdicts.',
  TECHNICAL: 'Depth of understanding, ability to explain trade-offs and justify choices, real-world applicability, and honesty about limits — saying "I don\'t know" with a recovery plan beats guessing.',
  BEHAVIORAL: 'STAR shape (situation, task, action, result), specific examples with measurable outcomes, ownership, reflection and learning, and whether claims are grounded rather than generic.',
  SYSTEM_DESIGN: 'Requirements gathering, capacity and scale reasoning, trade-offs between options (consistency vs availability, SQL vs NoSQL), failure handling, and the ability to defend decisions.',
  PROJECT: 'Specificity to their actual code and architecture, decisions and their rationale, challenges and how they were overcome, and measurable outcomes or impact.',
};

export const MOCK_MAX_TURNS = 8;
const MAX_TURNS = 8;

// ──────────────────────────────────────────────────────────────
// Prompt building
// ──────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: InterviewContext): string {
  const persona = MODE_PERSONAS[ctx.mode] || MODE_PERSONAS.TECHNICAL;
  const rubric = MODE_RUBRICS[ctx.mode] || MODE_RUBRICS.TECHNICAL;
  const resume = ctx.resumeText?.trim() || 'The candidate did not provide a resume.';
  const jd = ctx.jdText?.trim();
  const github = ctx.githubSummary?.trim();

  return [
    `You are ${persona}`,
    ``,
    `You are interviewing a candidate for the role of "${ctx.role}" at "${ctx.company}". Interview mode: ${ctx.mode}.`,
    ``,
    `<candidate_resume>`,
    resume,
    `</candidate_resume>`,
    ...(jd ? [``, `<job_description>`, jd, `</job_description>`] : []),
    ...(github ? [``, `<github_summary>`, github, `</github_summary>`] : []),
    ...(ctx.mode === 'PROJECT'
      ? [
          ``,
          `<github_instructions>`,
          `- The <github_summary> contains the candidate's real repos: README excerpts, file trees, and actual source code.`,
          `- In PROJECT mode, ask pointed questions about specific files, functions, and architectural decisions visible in that code.`,
          `- Reference concrete file names and code from the summary in your questions. Do not ask generic "tell me about your project" questions when you have their actual code.`,
          `</github_instructions>`,
        ]
      : []),
    ``,
    `<evaluation_rubric>`,
    `Weigh every answer against this rubric for ${ctx.mode} mode:`,
    rubric,
    `The rubric is private — never repeat it to the candidate or hint that you are scoring them.`,
    `</evaluation_rubric>`,
    ``,
    `<operating_rules>`,
    `- Personalize every question to the candidate's resume and the target role. Do not ask generic questions when the resume gives you material.`,
    `- Speak in voice-friendly language, maximum 3 sentences per turn.`,
    `- After each answer, evaluate it against the rubric:`,
    `  * Strong answer — acknowledge briefly (one short clause), then ask ONE probing follow-up that goes one level deeper on the same topic before moving on.`,
    `  * Weak or wrong — respond with sender "teaching": one-sentence concept explanation plus one practical tip, then ask one focused follow-up or move on.`,
    `  * Off-topic, vague, or evasive — respond with sender "teaching" and gently redirect back to the question.`,
    `- Alternate topics so the interview stays balanced, and never repeat a question.`,
    `- Do not invent facts about the candidate's background; if something is unclear, ask rather than assume.`,
    `- Keep the candidate engaged; do not dump information.`,
    `</operating_rules>`,
    ``,
    `<response_format>`,
    `ALWAYS reply with exactly one JSON object, no markdown fences, no prose outside the JSON.`,
    `For a normal turn: {"sender":"interviewer","text":"<your message>"}`,
    `For a teaching turn: {"sender":"teaching","text":"<concept explanation + tip>"}`,
    `</response_format>`,
  ].join('\n');
}

// ──────────────────────────────────────────────────────────────
// Mock fallback (used when the gateway server is unreachable)
// ──────────────────────────────────────────────────────────────

const MOCK_QUESTIONS = [
  {
    question: 'Based on your resume, walk me through the project you\'re most proud of. What was your exact role and the hardest technical problem you solved?',
    keywords: [],
    teach: '',
  },
  {
    question: 'For that project, how did you design for scale — what data structures or indexes did you reach for, and what were the trade-offs?',
    keywords: ['index', 'cache', 'queue', 'partition', 'b-tree', 'database', 'sql'],
    teach: 'Trade-offs are what interviewers listen for. A B-tree index gives O(log n) lookups and ordered scans, while a cache trades consistency for latency. Name the trade-off explicitly next time.',
  },
  {
    question: 'Describe a time you disagreed with a teammate about a technical decision. How did you resolve it?',
    keywords: ['disagree', 'align', 'discuss', 'compromise', 'listen', 'talk'],
    teach: 'Interviewers want to hear the STAR shape: situation, task, action, and the actual result. Walk through the outcome and what you learned.',
  },
  {
    question: 'If you had to make that project\'s API calls idempotent and handle duplicate or out-of-order events, how would you design it?',
    keywords: ['idempot', 'dedup', 'unique', 'key', 'queue', 'sequence'],
    teach: 'Idempotency is the core idea — the same event applied twice must have the same effect. Key the handler on a stable event id and deduplicate against stored state.',
  },
];

function mockStart(state: InterviewState): { analysis: InterviewState['analysis']; question: string } {
  const name = state.role || 'the target role';
  const analysis = {
    summary: `Interviewing for ${name} at ${state.company} (${state.mode} mode). I will probe your hands-on experience, technical depth, and behavior using your resume as the source.`,
    strengths: ['Hands-on project experience', 'Technical fundamentals'],
    focusAreas: ['Trade-off reasoning', 'System design at scale'],
  };
  return { analysis, question: MOCK_QUESTIONS[0].question };
}

function mockAnswer(state: InterviewState, candidateText: string): { sender: 'interviewer' | 'teaching'; text: string } {
  const q = MOCK_QUESTIONS[Math.min(state.turnCount, MOCK_QUESTIONS.length - 1)];
  const text = candidateText.toLowerCase();
  const matched = q.keywords.length > 0 && q.keywords.some((k) => text.includes(k));
  if (matched || q.keywords.length === 0) {
    return {
      sender: 'interviewer',
      text: 'Solid answer. Let\'s go a level deeper.',
    };
  }
  return {
    sender: 'teaching',
    text: `Not quite — here's the core concept:\n\n${q.teach}\n\nTip: always name the trade-off you are making and why it wins for this case.`,
  };
}

// ──────────────────────────────────────────────────────────────
// Engine API
// ──────────────────────────────────────────────────────────────

export async function createInterviewState(ctx: InterviewContext): Promise<InterviewState> {
  const gateway = await createGatewaySession(`${ctx.role} interview — ${ctx.company}`);
  return {
    ...ctx,
    gateway,
    transcript: [],
    turnCount: 0,
    maxTurns: ctx.maxTurns ?? MAX_TURNS,
    completed: false,
    analysis: null,
  };
}

export interface StartResult {
  analysis: InterviewState['analysis'];
  question: string;
}

/** Send the system prompt + resume context and get the analysis + first question. */
export async function startInterview(state: InterviewState): Promise<StartResult> {
  if (state.gateway.fromMock) {
    const mock = mockStart(state);
    state.analysis = mock.analysis;
    state.transcript.push({
      sender: 'system',
      text: 'OpenCode gateway unavailable — running in offline practice mode.',
      timestamp: new Date().toISOString(),
    });
    return mock;
  }

  const prompt = buildSystemPrompt(state) + [
    ``,
    `First turn: analyze the candidate's resume against the role and produce this JSON:`,
    `{"summary":"<1-2 sentence analysis>","strengths":["<2-3>"],"focusAreas":["<2-3>"],"question":"<your first personalized interview question>"}`,
  ].join('\n');

  const completion = await sendGatewayMessage(state.gateway.gatewaySessionId, prompt);
  const parsed = parseStartTurn(completion.text);
  state.analysis = parsed.analysis;
  state.transcript.push({
    sender: 'system',
    text: `Gateway: ${completion.provider} (${completion.latencyMs}ms)`,
    timestamp: new Date().toISOString(),
  });
  return { analysis: parsed.analysis, question: parsed.question };
}

export interface AnswerResult {
  sender: 'interviewer' | 'teaching';
  text: string;
  turnCount: number;
  completed: boolean;
}

// Mode-aware closing line used when the session hits its turn cap.
const CLOSING_LINES: Record<InterviewMode, string> = {
  CODING: 'That wraps up the coding challenge — generating your feedback report now, including edge cases and complexity notes. Nice work!',
  TECHNICAL: 'That covers the technical portion — generating your feedback report now, focused on depth and trade-offs. Great session!',
  BEHAVIORAL: 'That completes the behavioral portion — generating your feedback report now with notes on structure and outcomes. Well done!',
  SYSTEM_DESIGN: 'That wraps the system design round — generating your feedback report now with scale and trade-off observations. Excellent work!',
  PROJECT: 'That covers your project experience — generating your feedback report now with specifics from your code. Great session!',
};

function closingLine(mode: InterviewMode): string {
  return CLOSING_LINES[mode] || CLOSING_LINES.TECHNICAL;
}

/** Evaluate a candidate answer and return the AI's next turn. */
export async function handleInterviewAnswer(state: InterviewState, candidateText: string): Promise<AnswerResult> {
  state.turnCount += 1;
  state.transcript.push({ sender: 'candidate', text: candidateText, timestamp: new Date().toISOString() });

  if (state.turnCount >= state.maxTurns) {
    state.completed = true;
    const result = {
      sender: 'interviewer' as const,
      text: closingLine(state.mode),
      turnCount: state.turnCount,
      completed: true,
    };
    state.transcript.push({ sender: 'interviewer', text: result.text, timestamp: new Date().toISOString() });
    return result;
  }

  let turn: { sender: 'interviewer' | 'teaching'; text: string };
  if (state.gateway.fromMock) {
    turn = mockAnswer(state, candidateText);
  } else {
    const lastQuestion =
      [...state.transcript]
        .reverse()
        .find((m) => m.sender === 'interviewer' || m.sender === 'teaching')?.text || '';
    const prompt = [
      `<question_asked>`,
      lastQuestion,
      `</question_asked>`,
      ``,
      `<candidate_answer>`,
      candidateText,
      `</candidate_answer>`,
      ``,
      `Evaluate the candidate's answer against your ${state.mode} evaluation rubric. Then choose the next turn:`,
      `- Strong answer: acknowledge briefly (one short clause), then ask ONE probing follow-up that goes one level deeper on the same topic, or move to the next topic if the point is fully covered.`,
      `- Weak or wrong answer: send a "teaching" turn — one-sentence concept explanation plus one practical tip — then ask one focused follow-up or move on.`,
      `- Off-topic, vague, or evasive answer: send a "teaching" turn that gently redirects back to the question.`,
      ``,
      `Reply with exactly one JSON object, no markdown: {"sender":"interviewer"|"teaching","text":"<max 3 sentences, voice-friendly>"}`,
    ].join('\n');
    const completion = await sendGatewayMessage(state.gateway.gatewaySessionId, prompt);
    turn = parseInterviewTurn(completion.text);
  }

  state.transcript.push({ sender: turn.sender, text: turn.text, timestamp: new Date().toISOString() });
  return { ...turn, turnCount: state.turnCount, completed: false };
}

// ──────────────────────────────────────────────────────────────
// Parsers
// ──────────────────────────────────────────────────────────────

function parseStartTurn(raw: string): StartResult {
  const cleaned = raw.trim().replace(/^```(json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const analysis = {
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        strengths: Array.isArray(obj.strengths) ? obj.strengths.filter((s: unknown) => typeof s === 'string') : [],
        focusAreas: Array.isArray(obj.focusAreas) ? obj.focusAreas.filter((s: unknown) => typeof s === 'string') : [],
      };
      const question = typeof obj.question === 'string' ? obj.question.trim() : '';
      if (question) {
        return { analysis, question };
      }
    } catch {
      /* fall through */
    }
  }
  return {
    analysis: {
      summary: cleaned,
      strengths: [],
      focusAreas: [],
    },
    question: cleaned,
  };
}
