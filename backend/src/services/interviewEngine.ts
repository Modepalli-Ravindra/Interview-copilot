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
  clearGatewayHistory,
  type GatewaySession,
} from './aiGateway';
import { isSemanticDuplicate, normalizeQuestion } from './questionDedup';

export type InterviewMode =
  | 'CODING'
  | 'TECHNICAL'
  | 'BEHAVIORAL'
  | 'SYSTEM_DESIGN'
  | 'PROJECT'
  | 'HR'
  | 'MIXED'
  | 'RESUME_BASED'
  | 'JD_BASED'
  | 'SKILLS_BASED';

export const VALID_MODES: InterviewMode[] = [
  'CODING', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'PROJECT',
  'HR', 'MIXED', 'RESUME_BASED', 'JD_BASED', 'SKILLS_BASED',
];

export type InterviewDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface InterviewContext {
  sessionId: string;
  mode: InterviewMode;
  role: string;
  company: string;
  resumeText: string;
  jdText?: string;
  githubSummary?: string;
  /** Serialized structured ProjectProfile (Phase 4) — richer grounding than githubSummary. */
  projectProfile?: string;
  /** Canonicalized resume skills (for combined context). */
  skills?: string[];
  /** Structured resume profile summary (from the resume parser). */
  resumeProfile?: string;
  /** Structured JD profile summary (from the JD parser). */
  jdProfile?: string;
  /** Deterministic resume<->JD match summary (from the match engine). */
  matchSummary?: string;
  /** Difficulty driver — influences question depth (default Medium). */
  difficulty?: InterviewDifficulty;
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
  /** Mock-mode cursor: index of the next unused static question. */
  mockCursor: number;
}

const MODE_PERSONAS: Record<InterviewMode, string> = {
  CODING: 'a Lead Software Engineer running a live coding interview. Evaluate data structures, algorithms, edge cases, and complexity. Guide with hints, never write the solution.',
  TECHNICAL: 'a Senior Staff Engineer probing deep technical knowledge, trade-offs, and real-world engineering judgment across the candidate\'s domain.',
  BEHAVIORAL: 'a Senior Talent Partner running a behavioral interview using the STAR method. Evaluate collaboration, conflict resolution, and ownership.',
  SYSTEM_DESIGN: 'a Principal Architect evaluating scalable, fault-tolerant system design. Probe trade-offs like consistency vs latency, SQL vs NoSQL.',
  PROJECT: 'a Staff Engineer reviewing the candidate\'s past projects in depth — architecture choices, challenges, and measurable outcomes.',
  HR: 'an experienced HR Business Partner running a realistic HR round. You build rapport, learn the candidate\'s background and goals, and probe fit, motivation, and soft skills with natural follow-ups.',
  MIXED: 'a versatile interviewer mixing HR, behavioral, technical, and project questions in a realistic interview flow, adapting the depth to the candidate\'s answers.',
  RESUME_BASED: 'a Senior Interviewer whose questions come exclusively from the candidate\'s actual resume — verifying claims, probing depth on projects, and exploring every listed skill.',
  JD_BASED: 'a Technical Recruiter whose questions come exclusively from the job description — probing how the candidate satisfies each requirement and responsibility.',
  SKILLS_BASED: 'a technical interviewer who drills into the candidate\'s declared skills one by one — fundamentals first, then edge cases and practical applications.',
};

// What the interviewer weighs when evaluating each answer (kept private from
// the candidate; the engine only references it to make scoring consistent).
const MODE_RUBRICS: Record<InterviewMode, string> = {
  CODING: 'Correctness and edge cases, time/space complexity, data-structure choice, clarity of approach, and how well the candidate communicates reasoning while coding. Prefer probing hints over passing verdicts.',
  TECHNICAL: 'Depth of understanding, ability to explain trade-offs and justify choices, real-world applicability, and honesty about limits — saying "I don\'t know" with a recovery plan beats guessing.',
  BEHAVIORAL: 'STAR shape (situation, task, action, result), specific examples with measurable outcomes, ownership, reflection and learning, and whether claims are grounded rather than generic.',
  SYSTEM_DESIGN: 'Requirements gathering, capacity and scale reasoning, trade-offs between options (consistency vs availability, SQL vs NoSQL), failure handling, and the ability to defend decisions.',
  PROJECT: 'Specificity to their actual code and architecture, decisions and their rationale, challenges and how they were overcome, and measurable outcomes or impact.',
  HR: 'Communication and clarity, confidence, relevance, structure (STAR-like), technical credibility when describing their own work, ownership, honesty/consistency, and conciseness for a voice interview. Do not fabricate facts about the candidate.',
  MIXED: 'Balanced assessment of communication (STAR), technical depth and trade-offs, project specificity, and role readiness across every dimension.',
  RESUME_BASED: 'Accuracy against the resume, depth behind each claim, technical credibility, ownership, and measurable outcomes. Challenge vague or exaggerated claims politely.',
  JD_BASED: 'Relevance to the job description, evidence of each required skill, hands-on examples, and role readiness. Note honest gaps instead of guessing.',
  SKILLS_BASED: 'Fundamental understanding of each declared skill, ability to explain trade-offs, practical application, and honesty about depth — probing beyond surface familiarity.',
};

export const MOCK_MAX_TURNS = 8;
const MAX_TURNS = 8;

// HR category flow (used in HR and MIXED modes to cover a realistic round).
export const HR_CATEGORIES = [
  'Introduction',
  'Education',
  'Career goals',
  'Why this role?',
  'Why this company?',
  'Why software development?',
  'Why AI/ML?',
  'Resume',
  'Projects',
  'Internship / Experience',
  'Career gap',
  'Strengths',
  'Weaknesses',
  'Failure',
  'Conflict',
  'Teamwork',
  'Leadership',
  'Pressure',
  'Time management',
  'Communication',
  'Adaptability',
  'Learning new technology',
  'Handling unfamiliar tasks',
  'Debugging/problem solving',
  'Self-rating',
  'Salary/relocation if appropriate',
  'Closing HR questions',
];

const DIFFICULTY_GUIDANCE: Record<InterviewDifficulty, string> = {
  Easy: 'Keep questions accessible: definitions, fundamentals, guided problem solving. Offer hints readily.',
  Medium: 'Balance fundamentals with applied depth: moderate trade-offs, multi-step problems, real-world judgment.',
  Hard: 'Push hard: deep trade-offs, scaling concerns, complex multi-part problems, and sharp follow-ups on any weak spot.',
};

export const TOPIC_FLOW = [
  'Introduction (Tell me about yourself)',
  'Project Discussion',
  'Role Expectations',
  'Technologies Overview',
  'Basic Java',
  'OOP Concepts',
  'Collections Framework',
  'Exceptions',
  'SQL Basics',
  'Scenario Questions',
  'Medium Difficulty Technical',
  'Hard Difficulty Technical'
];

// ──────────────────────────────────────────────────────────────
// Prompt building
// ──────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: InterviewContext): string {
  const persona = MODE_PERSONAS[ctx.mode] || MODE_PERSONAS.TECHNICAL;
  const rubric = MODE_RUBRICS[ctx.mode] || MODE_RUBRICS.TECHNICAL;
  const resume = ctx.resumeText?.trim() || 'The candidate did not provide a resume.';
  const jd = ctx.jdText?.trim();
  const github = ctx.githubSummary?.trim();
  const projectProfile = ctx.projectProfile?.trim();
  const difficulty = ctx.difficulty || 'Medium';
  const difficultyGuidance = DIFFICULTY_GUIDANCE[difficulty] || DIFFICULTY_GUIDANCE.Medium;
  const skills = Array.isArray(ctx.skills) && ctx.skills.length ? ctx.skills.join(', ') : '';
  const resumeProfile = ctx.resumeProfile?.trim();
  const jdProfile = ctx.jdProfile?.trim();
  const matchSummary = ctx.matchSummary?.trim();

  const modeSpecific = () => {
    switch (ctx.mode) {
      case 'PROJECT':
        return [
          ``,
          `<github_instructions>`,
          `- The <github_summary> contains the candidate's real repos: README excerpts, file trees, and actual source code.`,
          `- Ask pointed questions about specific files, functions, and architectural decisions visible in that code.`,
          `- Reference concrete file names and code from the summary in your questions. Do not ask generic "tell me about your project" questions when you have their actual code.`,
          `- Example of a good question: "Your repository uses React with Vite and separates UI into reusable components — what made you choose this structure, and how would you scale it to 50+ pages?"`,
          `- When a <structured_project_profile> is present, ground questions in its evidence (file paths, API endpoints, data models, and the README claims that were verified against the code).`,
          `</github_instructions>`,
        ];
      case 'HR':
        return [
          ``,
          `<hr_flow>`,
          `- Work through these HR categories in order, spending roughly one exchange per category: ${HR_CATEGORIES.join(', ')}.`,
          `- Start with Introduction, then move through Education, Career goals, the "Why" questions, then Resume/Projects/Internship, then behavioral categories, and end with closing questions.`,
          `- Every question must be personalized: use the candidate's resume, projects, education, and the job description. Never read from a generic script.`,
          `- After every answer, ask ONE contextual follow-up that depends on what the candidate just said (e.g. if they mention a blockchain project, ask "What made blockchain necessary instead of a traditional database?"). The follow-up must build on their exact words, not a canned list.`,
          `- Acknowledge briefly, then follow up; do not lecture.`,
          `</hr_flow>`,
        ];
      case 'MIXED':
        return [
          ``,
          `<mixed_flow>`,
          `- Simulate a realistic multi-round interview: open with HR/intro, move to resume/project discussion, then technical depth, then a closing behavioral question.`,
          `- Pull material from the resume, job description, and GitHub summary together — combine sources into each question.`,
          `- After each answer ask one contextual follow-up that depends on the previous answer before switching topics.`,
          `</mixed_flow>`,
        ];
      case 'RESUME_BASED':
        return [
          ``,
          `<resume_instructions>`,
          `- Every question must trace to a specific claim in <candidate_resume> (a project, skill, education detail, or role).`,
          `- Verify depth: ask "what exactly did you build/do", "what technology choice did you make and why", "what was the outcome".`,
          `- Politely challenge vague claims like "contributed to X" by asking for their specific contribution.`,
          `</resume_instructions>`,
        ];
      case 'JD_BASED':
        return [
          ``,
          `<jd_instructions>`,
          `- Every question must map to a requirement or responsibility in <job_description> (and <jd_profile> if present).`,
          `- Probe how the candidate satisfies each required skill with concrete evidence from their resume or projects.`,
          `- Ask them to demonstrate or explain missing/preferred skills honestly.`,
          `</jd_instructions>`,
        ];
      case 'SKILLS_BASED':
        return [
          ``,
          `<skills_instructions>`,
          `- Drill into each of the candidate's skills one at a time: fundamentals, then a trade-off question, then a practical application question.`,
          `- Start with the most relevant skills for the target role, then move to secondary skills.`,
          `- Do not ask about skills that are neither in their resume nor the job description.`,
          `</skills_instructions>`,
        ];
      default:
        return [];
    }
  };

  return [
    `You are ${persona}`,
    ``,
    `You are interviewing a candidate for the role of "${ctx.role}" at "${ctx.company}". Interview mode: ${ctx.mode}. Difficulty: ${difficulty}.`,
    ``,
    `<candidate_resume>`,
    resume,
    `</candidate_resume>`,
    ...(resumeProfile ? [``, `<structured_resume_profile>`, resumeProfile, `</structured_resume_profile>`] : []),
    ...(jd ? [``, `<job_description>`, jd, `</job_description>`] : []),
    ...(jdProfile ? [``, `<structured_jd_profile>`, jdProfile, `</structured_jd_profile>`] : []),
    ...(matchSummary ? [``, `<match_analysis>`, matchSummary, `</match_analysis>`] : []),
    ...(github ? [``, `<github_summary>`, github, `</github_summary>`] : []),
    ...(projectProfile ? [``, `<structured_project_profile>`, projectProfile, `</structured_project_profile>`] : []),
    ...(skills ? [``, `<normalized_skills>`, skills, `</normalized_skills>`] : []),
    ...modeSpecific(),
    ``,
    `<difficulty_guidance>`,
    difficultyGuidance,
    `</difficulty_guidance>`,
    ``,
    `<evaluation_rubric>`,
    `Weigh every answer against this rubric for ${ctx.mode} mode:`,
    rubric,
    `The rubric is private — never repeat it to the candidate or hint that you are scoring them.`,
    `</evaluation_rubric>`,
    ``,
    `<operating_rules>`,
    `- You MUST behave like a REAL HUMAN interviewer (Microsoft, Amazon, etc). Use conversational affirmations like "Good", "Interesting", "Let's move to another topic", "I understand", "No problem".`,
    `- Personalize every question to the candidate's resume and the target role. Do not ask generic questions when the resume gives you material.`,
    `- Combine all sources (resume + job description + GitHub + skills) into the questions where possible.`,
    `- Speak in voice-friendly language, maximum 3 sentences per turn.`,
    `- After each answer, evaluate it against the rubric:`,
    `  * Strong answer — acknowledge briefly with human affirmations, then ask ONE probing follow-up that goes one level deeper, or move to the next topic. Dynamically increase difficulty for the next question.`,
    `  * Weak or wrong answer — respond with sender "teaching": decrease difficulty, and explain the concept naturally using conversational Telugu written ONLY in English letters (e.g., "Simple ga explain chesthanu. Inheritance ante parent class properties child class ki vasthai..."). Do NOT use Telugu Unicode. Then ask a focused follow-up or move on.`,
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
  // Q0 is emitted as the opening question, so the mock answer cursor starts
  // after it.
  state.mockCursor = 1;
  return { analysis, question: MOCK_QUESTIONS[0].question };
}

function mockAnswer(state: InterviewState, candidateText: string): { sender: 'interviewer' | 'teaching'; text: string } {
  // Each answer consumes exactly one mock question, in order, so the static
  // pool is never repeated and every question is used at most once. Once the
  // pool is exhausted the engine rotates deeper follow-ups instead.
  const asked = state.transcript
    .filter((m) => m.sender === 'interviewer' || m.sender === 'teaching')
    .map((m) => m.text);

  let idx = state.mockCursor ?? 0;
  // Rebuild-safe: if the state was recreated from a persisted transcript the
  // in-memory cursor is lost, so recover it from the number of answers
  // already recorded. The current answer's candidate turn is pushed before
  // this function runs, so `answered - 1` is the count of consumed questions.
  const answered = state.transcript.filter((m) => m.sender === 'candidate').length;
  idx = Math.max(idx, Math.min(Math.max(0, answered - 1), MOCK_QUESTIONS.length));

  if (idx >= MOCK_QUESTIONS.length) {
    return {
      sender: 'interviewer',
      text: deeperFollowUp(asked),
    };
  }

  const q = MOCK_QUESTIONS[idx];
  state.mockCursor = idx + 1;
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

/**
 * Rotating deeper-follow-up pool. Used whenever the interviewer must move
 * deeper without repeating an existing question (mock pool exhausted, or the
 * live model echoes an earlier question). Rotation guarantees the fallback
 * itself is never the exact same sentence twice in a row.
 */
const DEEPER_FOLLOW_UPS = [
  'Interesting — can you go one level deeper on that and walk me through the trade-offs you weighed?',
  'Let\'s go one level deeper on that — what trade-offs did you consider, and what would you do differently if you built it again?',
  'Could you walk me through a concrete example of that, including the key decision you made and the alternative you rejected?',
  'What would happen at 10x the scale or traffic — where does your current approach start to break?',
];

export function deeperFollowUp(asked: string[]): string {
  const fallback = DEEPER_FOLLOW_UPS.find((f) => !asked.some((a) => isSemanticDuplicate(f, a)));
  return fallback || DEEPER_FOLLOW_UPS[0];
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
    mockCursor: 0,
  };
}

export function normalizeDifficulty(value: string | undefined): InterviewDifficulty {
  const v = (value || '').toLowerCase();
  if (v.includes('easy') || v.includes('junior')) return 'Easy';
  if (v.includes('hard') || v.includes('staff') || v.includes('senior')) return 'Hard';
  return 'Medium';
}

export interface StartResult {
  analysis: InterviewState['analysis'];
  question: string;
}

/** Send the system prompt + resume context and get the analysis + first question. */
export async function startInterview(state: InterviewState): Promise<StartResult> {
  let question: string;
  if (state.gateway.fromMock) {
    const mock = mockStart(state);
    state.analysis = mock.analysis;
    question = mock.question;
    state.transcript.push({
      sender: 'system',
      text: 'OpenCode gateway unavailable — running in offline practice mode.',
      timestamp: new Date().toISOString(),
    });
  } else {
    const prompt = buildSystemPrompt(state) + [
      ``,
      `First turn: analyze the candidate's resume against the role and produce this JSON:`,
      `{"summary":"<1-2 sentence analysis>","strengths":["<2-3>"],"focusAreas":["<2-3>"],"question":"<your first personalized interview question>"}`,
    ].join('\n');

    const completion = await sendGatewayMessage(state.gateway.gatewaySessionId, prompt);
    const parsed = parseStartTurn(completion.text);
    state.analysis = parsed.analysis;
    question = parsed.question;
    state.transcript.push({
      sender: 'system',
      text: `Gateway: ${completion.provider} (${completion.latencyMs}ms)`,
      timestamp: new Date().toISOString(),
    });
  }

  // Persist the opening question on the transcript. The dedup guard and the
  // feedback generator read interviewer/teaching turns from the transcript,
  // so the first question must be visible there or the model could repeat it.
  state.transcript.push({ sender: 'interviewer', text: question, timestamp: new Date().toISOString() });

  return { analysis: state.analysis, question };
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
  HR: 'That completes the HR round — generating your feedback report now with notes on communication, clarity, and role fit. Well done!',
  MIXED: 'That completes your mixed interview — generating your feedback report now across HR, technical, and project dimensions. Great session!',
  RESUME_BASED: 'That covers your resume in depth — generating your feedback report now with claims-verification notes. Nice work!',
  JD_BASED: 'That covers the job description — generating your feedback report now with role-readiness notes. Great session!',
  SKILLS_BASED: 'That covers your skill set — generating your feedback report now with depth and gap observations. Well done!',
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
    const askedQuestions = state.transcript
      .filter((m) => m.sender === 'interviewer' || m.sender === 'teaching')
      .map((m) => m.text.trim())
      .filter(Boolean)
      .slice(0, 12);
    const currentTopic = TOPIC_FLOW[Math.min(state.turnCount, TOPIC_FLOW.length - 1)];
    const prompt = [
      `<context>`,
      `Resume Summary: ${state.analysis?.summary || 'N/A'}`,
      `JD Summary: ${state.jdProfile || 'N/A'}`,
      `Difficulty: ${state.difficulty || 'Medium'}`,
      `Interview State: Turn ${state.turnCount}/${state.maxTurns}`,
      `Current Topic: ${currentTopic}`,
      `</context>`,
      ``,
      `<question_asked>`,
      lastQuestion,
      `</question_asked>`,
      ``,
      `<questions_already_asked>`,
      askedQuestions.length ? askedQuestions.join('\n') : '(none)',
      `</questions_already_asked>`,
      ``,
      `<candidate_answer>`,
      candidateText,
      `</candidate_answer>`,
      ``,
      `Evaluate the candidate's answer against your ${state.mode} evaluation rubric. Then choose the next turn:`,
      `- Strong answer: acknowledge briefly (e.g. "Good", "Interesting"), then move to the next topic or ask ONE probing follow-up. Increase difficulty for the next question.`,
      `- Weak or wrong answer: send a "teaching" turn — decrease difficulty, explain the concept naturally using conversational Telugu written ONLY in English letters (NO Telugu Unicode), then ask one focused follow-up or move on.`,
      `- Off-topic or evasive: send a "teaching" turn that gently redirects.`,
      ``,
      `DEDUP RULE: NEVER repeat a question in <questions_already_asked>, even reworded.`,
      ``,
      `Reply with exactly one JSON object, no markdown: {"sender":"interviewer"|"teaching","text":"<max 3 sentences, voice-friendly>"}`,
    ].join('\n');
    clearGatewayHistory(state.gateway.gatewaySessionId);
    const completion = await sendGatewayMessage(state.gateway.gatewaySessionId, prompt);
    turn = parseInterviewTurn(completion.text);
    // Soft guard: if the model somehow echoes an earlier question verbatim,
    // fall back to a rotating deeper follow-up instead of repeating it.
    if (
      turn.sender === 'interviewer' &&
      askedQuestions.some((q) => isSemanticDuplicate(turn.text, q))
    ) {
      turn = {
        sender: 'interviewer',
        text: deeperFollowUp(askedQuestions),
      };
    }
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
