/**
 * Resume Analyzer — sends the candidate's resume to the AI Gateway and
 * returns a structured analysis (strengths, gaps, suggested questions).
 */

import { createGatewaySession, sendGatewayMessage } from './aiGateway';

export interface ResumeAnalysis {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  suggestedQuestions: string[];
}

function parseAnalysis(raw: string): ResumeAnalysis {
  const cleaned = raw.trim().replace(/^```(json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const asStringArray = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      if (obj && typeof obj.summary === 'string') {
        return {
          summary: obj.summary,
          strengths: asStringArray(obj.strengths),
          focusAreas: asStringArray(obj.focusAreas),
          suggestedQuestions: asStringArray(obj.suggestedQuestions),
        };
      }
    } catch {
      /* fall through */
    }
  }
  return {
    summary: cleaned || 'No analysis available.',
    strengths: [],
    focusAreas: [],
    suggestedQuestions: [],
  };
}

function mockAnalysis(resumeText: string, role: string): ResumeAnalysis {
  const length = resumeText.trim().length;
  const skills = (resumeText.match(/\b(React|Node|TypeScript|Python|Java|Go|AWS|Docker|SQL|Postgres|Kubernetes|GraphQL|Redis|System Design|Machine Learning)\b/gi) || []);
  const unique = Array.from(new Set(skills.map((s) => s.toLowerCase())));
  return {
    summary: `Resume parsed (${length} chars) for the role of ${role}. ${unique.length > 0 ? `Key skills detected: ${unique.slice(0, 6).join(', ')}.` : 'No specific keywords detected — consider a richer resume.'}`,
    strengths: unique.slice(0, 3).map((s) => `${s} experience`),
    focusAreas: ['Trade-off reasoning', 'System design at scale', 'Behavioral STAR answers'],
    suggestedQuestions: [
      'Walk me through your most technically challenging project.',
      'How did you measure the impact of your last contribution?',
      'Describe a system you designed that had to scale — what were the constraints?',
    ],
  };
}

export async function analyzeResumeText(input: {
  resumeText: string;
  role: string;
  company: string;
}): Promise<{ analysis: ResumeAnalysis; fromMock: boolean }> {
  const resume = input.resumeText?.trim() || '';

  const session = await createGatewaySession('Resume analysis');
  if (session.fromMock) {
    return { analysis: mockAnalysis(resume, input.role), fromMock: true };
  }

  const prompt = [
    `You are a senior technical recruiter and engineer. Analyze this resume for the role "${input.role}" at "${input.company}".`,
    ``,
    `<resume>`,
    resume,
    `</resume>`,
    ``,
    `Return exactly one JSON object, no markdown:`,
    `{"summary":"<1-2 sentence assessment>","strengths":["<2-4 concrete strengths grounded in the resume>"],"focusAreas":["<2-4 gaps or areas to probe>"],"suggestedQuestions":["<3-5 personalized interview questions>"]}`,
  ].join('\n');

  const completion = await sendGatewayMessage(session.gatewaySessionId, prompt);
  return { analysis: parseAnalysis(completion.text), fromMock: false };
}
