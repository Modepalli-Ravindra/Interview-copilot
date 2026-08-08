/**
 * Learning Roadmap Generator — produces a structured, role-specific study
 * plan. Uses the AI Gateway when live; otherwise derives a deterministic
 * plan from the role and any available analysis.
 */

import { createGatewaySession, sendGatewayMessage } from './aiGateway';

export interface RoadmapStep {
  title: string;
  desc: string;
  timeEstimate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'in-progress' | 'pending';
}

export interface Roadmap {
  title: string;
  summary: string;
  steps: RoadmapStep[];
  generatedAt: string;
}

interface RoadmapInput {
  role: string;
  company: string;
  mode: string;
  focusAreas?: string[];
  strengths?: string[];
}

const DEFAULT_AREAS = [
  'Trade-off reasoning',
  'System design at scale',
  'Behavioral STAR answers',
  'Data structures & algorithms',
];

function deriveRoadmap(input: RoadmapInput): Roadmap {
  const areas = (input.focusAreas && input.focusAreas.length ? input.focusAreas : DEFAULT_AREAS).slice(0, 4);
  const steps: RoadmapStep[] = areas.map((topic, i) => ({
    title: topic,
    desc: `Build depth in ${topic.toLowerCase()} with targeted ${input.mode} practice for the ${input.role} role.`,
    timeEstimate: `${3 + i * 2} days`,
    priority: i === 0 ? 'HIGH' : i === 1 ? 'HIGH' : 'MEDIUM',
    status: i === 0 ? 'in-progress' : 'pending',
  }));
  return {
    title: `${input.role.replace(/^(\w+)/, (m) => m[0].toUpperCase() + m.slice(1))} Interview Roadmap`,
    summary: `A ${steps.length}-step plan tuned to ${input.role} interviews${input.company !== 'Unknown' ? ` at ${input.company}` : ''}, built from your recent session analysis.`,
    steps,
    generatedAt: new Date().toISOString(),
  };
}

function parseRoadmap(raw: string): Roadmap | null {
  const cleaned = raw.trim().replace(/^```(json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.title !== 'string' || !Array.isArray(obj.steps)) return null;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const steps: RoadmapStep[] = obj.steps
      .filter((s: any) => s && typeof s.title === 'string')
      .map((s: any) => ({
        title: s.title,
        desc: str(s.desc),
        timeEstimate: str(s.timeEstimate) || '2-3 days',
        priority: (['HIGH', 'MEDIUM', 'LOW'].includes(s.priority) ? s.priority : 'MEDIUM') as RoadmapStep['priority'],
        status: s.status === 'in-progress' ? 'in-progress' : 'pending',
      }));
    return {
      title: obj.title,
      summary: str(obj.summary),
      steps: steps.length ? steps : [{ title: 'Core fundamentals', desc: 'Solidify fundamentals first.', timeEstimate: '3 days', priority: 'HIGH', status: 'in-progress' }],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function generateRoadmap(input: RoadmapInput): Promise<{ roadmap: Roadmap; fromMock: boolean }> {
  const fallback = deriveRoadmap(input);

  const session = await createGatewaySession('Learning roadmap');
  if (session.fromMock) {
    return { roadmap: fallback, fromMock: true };
  }

  const prompt = [
    `You are a senior engineer building an interview-prep roadmap for a ${input.role} role${input.company !== 'Unknown' ? ` at ${input.company}` : ''} (${input.mode} focus).`,
    ...(input.focusAreas?.length ? [`Priority focus areas: ${input.focusAreas.join(', ')}.`] : []),
    ...(input.strengths?.length ? [`Known strengths (less time needed): ${input.strengths.join(', ')}.`] : []),
    ``,
    `Return exactly one JSON object, no markdown:`,
    `{"title":"<roadmap title>","summary":"<1-2 sentence overview>","steps":[{"title":"<topic>","desc":"<what to practice and why>","timeEstimate":"<e.g. 3 days>","priority":"HIGH|MEDIUM|LOW","status":"in-progress|pending"}]}`,
    `Return 4-6 steps.`,
  ].join('\n');

  try {
    const completion = await sendGatewayMessage(session.gatewaySessionId, prompt);
    const roadmap = parseRoadmap(completion.text);
    if (!roadmap) return { roadmap: fallback, fromMock: true };
    return { roadmap, fromMock: false };
  } catch (err) {
    console.warn('[Roadmap] AI generation failed, using derived plan:', (err as Error).message);
    return { roadmap: fallback, fromMock: true };
  }
}
