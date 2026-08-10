/**
 * Resume <-> JD Matching Engine (deterministic).
 *
 * Numeric scores are computed from real overlap (skills, experience years,
 * project alignment, keyword density) — never invented by an LLM.
 */

import type { ResumeProfile } from './resumeParser';
import type { JdProfile } from './jdParser';
import { getSkillCategory, normalizeSkill, areRelatedSkills } from './skills';

export interface MatchSkill {
  skill: string;
  category: string;
  source: 'resume' | 'jd' | 'both';
}

/** A JD skill satisfied only by a related-but-distinct resume skill. */
export interface PartialMatchSkill {
  skill: string;
  category: string;
  relatedSkill: string;
  source: 'jd';
}

export interface MatchResult {
  overallMatch: number;
  skillMatch: number;
  experienceMatch: number;
  experienceInsufficient: boolean;
  projectMatch: number;
  keywordMatch: number;
  matchedSkills: MatchSkill[];
  partiallyMatchedSkills: PartialMatchSkill[];
  missingSkills: MatchSkill[];
  strongAreas: Array<{ category: string; score: number }>;
  weakAreas: Array<{ category: string; score: number }>;
  preparationTopics: string[];
  /** Backwards-compatible alias for preparationTopics. */
  recommendedTopics: string[];
  generatedAt: string;
}

interface JdSkill {
  skill: string;
  required: boolean;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Resolve a single date token to a (year, month) point. */
function datePoint(token: string): { y: number; m: number } | null {
  const t = token.trim();
  if (/^(present|current|now|till\s*date)$/i.test(t)) {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }
  const yearOnly = t.match(/^(19|20)\d{2}$/);
  if (yearOnly) return { y: Number(yearOnly[0]), m: 6 };
  const monthYear = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*((?:19|20)\d{2})/i);
  if (monthYear) {
    const y = Number(monthYear[2]);
    const m = MONTH_NAMES[monthYear[1].slice(0, 3).toLowerCase()];
    if (y >= 1970 && y <= new Date().getFullYear() + 1 && m) return { y, m };
  }
  return null;
}

/** Extract years of experience from a resume from dated roles (month-precise). */
function extractResumeYears(p: ResumeProfile): number {
  let months = 0;
  const durations = [
    ...p.experience.map((e) => e.duration),
    ...p.internships.map((i) => i.duration),
  ];
  for (const d of durations) {
    const m = d.match(/(.+?)\s*[-–—]\s*(.+)/);
    if (!m) continue;
    const start = datePoint(m[1]);
    const end = datePoint(m[2]);
    if (!start || !end) continue;
    if (end.y < start.y || (end.y === start.y && end.m < start.m)) continue;
    let span = (end.y - start.y) * 12 + (end.m - start.m);
    if (span === 0) span = 1;
    months += span;
  }
  return Math.round((months / 12) * 10) / 10;
}

/**
 * Required experience years from the JD plus whether the range is entry-level
 * (starts at 0, e.g. "0-2 years"). Returns years=0 when the JD states no
 * numeric experience requirement.
 */
function parseRequiredYears(jd: JdProfile): { years: number; entryLevel: boolean } {
  const exp = jd.experience || '';
  const range = exp.match(/(\d{1,2})\s*(?:to|[-–—])\s*(\d{1,2})\s*\+?\s*(?:years?|yrs)/i);
  if (range) {
    const low = Number(range[1]);
    return { years: Number(range[2]), entryLevel: low === 0 };
  }
  const single = exp.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs)/i);
  if (single) return { years: Number(single[1]), entryLevel: false };
  return { years: 0, entryLevel: false };
}

function projectTech(p: ResumeProfile): Set<string> {
  const set = new Set<string>();
  for (const proj of p.projects) {
    for (const t of proj.technologies) set.add(t.toLowerCase());
  }
  for (const exp of [...p.experience, ...p.internships]) {
    for (const t of exp.technologies) set.add(t.toLowerCase());
  }
  return set;
}

export function matchResumeToJd(p: ResumeProfile, jd: JdProfile): MatchResult {
  const resumeSkills = new Set(p.skills.map((s) => s.toLowerCase()));
  const resumeSkillArray = Array.from(resumeSkills);
  const displayName = (name: string): string => normalizeSkill(name) || name;
  const projectTech = new Set<string>();
  for (const proj of p.projects) for (const t of proj.technologies) projectTech.add(t.toLowerCase());
  for (const exp of [...p.experience, ...p.internships]) for (const t of exp.technologies) projectTech.add(t.toLowerCase());

  const jdSkills: JdSkill[] = [
    ...jd.requiredSkills.map((s) => ({ skill: s.toLowerCase(), required: true })),
    ...jd.preferredSkills.map((s) => ({ skill: s.toLowerCase(), required: false })),
    ...jd.toolsTechnologies
      .filter((s) => !jd.requiredSkills.includes(s) && !jd.preferredSkills.includes(s))
      .map((s) => ({ skill: s.toLowerCase(), required: false })),
  ];
  const deduped: JdSkill[] = [];
  for (const s of jdSkills) {
    if (!deduped.some((d) => d.skill === s.skill)) deduped.push(s);
  }

  const matchedSkills: MatchSkill[] = [];
  const missingSkills: MatchSkill[] = [];
  const partiallyMatchedSkills: PartialMatchSkill[] = [];
  let weightedMatched = 0;
  let partialCredit = 0;
  let weightedTotal = 0;

  for (const s of deduped) {
    const weight = s.required ? 2 : 1;
    weightedTotal += weight;
    const has = resumeSkills.has(s.skill);
    const category = getSkillCategory(s.skill) || 'Unknown';
    if (has) {
      weightedMatched += weight;
      matchedSkills.push({ skill: displayName(s.skill), category, source: 'both' });
      continue;
    }
    // Partial match — a related-but-distinct resume skill earns half credit
    // (e.g. PostgreSQL satisfies an "SQL" requirement).
    const related = resumeSkillArray.find((r) => areRelatedSkills(s.skill, r));
    if (related) {
      partialCredit += weight * 0.5;
      partiallyMatchedSkills.push({
        skill: displayName(s.skill),
        category,
        relatedSkill: displayName(related),
        source: 'jd',
      });
      continue;
    }
    missingSkills.push({ skill: displayName(s.skill), category, source: 'jd' });
  }

  const skillMatch = weightedTotal > 0 ? Math.round(((weightedMatched + partialCredit) / weightedTotal) * 100) : 0;

  // Experience match — only computed when the JD states a numeric requirement
  // AND the resume has dated roles; otherwise the signal is missing, and we say
  // so rather than inventing a score.
  const resumeYears = extractResumeYears(p);
  const required = parseRequiredYears(jd);
  let experienceMatch = 0;
  let experienceInsufficient = false;
  if (required.years <= 0) {
    experienceInsufficient = true;
  } else if (resumeYears <= 0) {
    experienceInsufficient = true;
  } else if (required.entryLevel) {
    // "0-2 years": floor at 50 so fresh graduates are not auto-failed, reach
    // 100 at the top of the range.
    experienceMatch = Math.round(Math.min(100, Math.max(50, (resumeYears / required.years) * 100)));
  } else {
    experienceMatch = Math.round(Math.min(100, (resumeYears / required.years) * 100));
  }

  // Project match — how many matched JD skills appear across projects/roles
  const matchedJdSkills = new Set(deduped.filter((s) => resumeSkills.has(s.skill)).map((s) => s.skill));
  let projectTechCount = 0;
  let projectSkillHits = 0;
  for (const t of projectTech) {
    if (matchedJdSkills.has(t)) projectSkillHits += 1;
    projectTechCount += 1;
  }
  const projectMatch = matchedJdSkills.size > 0
    ? Math.round((projectSkillHits / matchedJdSkills.size) * 100)
    : projectTechCount > 0 ? 60 : 40;

  // Keyword match — token overlap between JD text and resume text
  const jdTokens = new Set(jd.rawText.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const resumeText = p.rawText.toLowerCase();
  let keywordHits = 0;
  let keywordTotal = 0;
  const stop = new Set(['with', 'this', 'that', 'have', 'will', 'your', 'the', 'and', 'for', 'you', 'are', 'work', 'role', 'team', 'using', 'ability', 'strong', 'experience']);
  for (const t of jdTokens) {
    if (stop.has(t)) continue;
    keywordTotal += 1;
    if (resumeText.includes(t)) keywordHits += 1;
  }
  const keywordMatch = keywordTotal > 0 ? Math.round((keywordHits / keywordTotal) * 100) : 50;

  const hasExperience = !experienceInsufficient;
  const overallMatch = Math.round(
    ((skillMatch * 0.4 + (hasExperience ? experienceMatch * 0.2 : 0) + projectMatch * 0.15 + keywordMatch * 0.25) /
      (hasExperience ? 1 : 0.8)),
  );

  // Strong/weak areas by category
  const byCategory = new Map<string, { matched: number; total: number }>();
  for (const s of deduped) {
    const cat = getSkillCategory(s.skill) || 'Unknown';
    const entry = byCategory.get(cat) || { matched: 0, total: 0 };
    entry.total += 1;
    if (resumeSkills.has(s.skill)) entry.matched += 1;
    byCategory.set(cat, entry);
  }
  const areas = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, score: v.total ? Math.round((v.matched / v.total) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);

  const strongAreas = areas.filter((a) => a.score >= 70).slice(0, 4);
  const weakAreas = areas.filter((a) => a.score < 50).slice(0, 4);

  // Recommended prep topics
  const preparationTopics = unique([
    ...missingSkills.map((m) => `Learn/practice ${m.skill}`),
    ...partiallyMatchedSkills.map((p) => `Deepen ${p.skill} — only related experience (${p.relatedSkill}) found`),
    ...(experienceInsufficient
      ? [required.years > 0
          ? `Show dated work experience with month ranges — the JD asks for ${required.years}yr+ and your experience couldn't be determined`
          : 'Be ready to discuss your experience narrative — the JD lists no formal years requirement']
      : experienceMatch < 60
        ? [`Strengthen hands-on experience narrative for ${required.years}yr+ roles`]
        : []),
    ...(projectMatch < 50 ? ['Prepare concrete project stories with measurable outcomes'] : []),
    ...strongAreas.slice(0, 1).map((a) => `Leverage ${a.category} depth in answers`),
    ...weakAreas.slice(0, 2).map((a) => `Build foundational knowledge in ${a.category}`),
  ]).slice(0, 8);

  return {
    overallMatch,
    skillMatch,
    experienceMatch,
    experienceInsufficient,
    projectMatch,
    keywordMatch,
    matchedSkills,
    partiallyMatchedSkills,
    missingSkills,
    strongAreas,
    weakAreas,
    preparationTopics,
    recommendedTopics: preparationTopics,
    generatedAt: new Date().toISOString(),
  };
}

/** Compact human-readable summary of a match — used for interview context. */
export function summarizeMatchReport(m: MatchResult): string {
  const parts: string[] = [];
  const experienceClause = m.experienceInsufficient
    ? 'experience not enough information to calculate'
    : `experience ${m.experienceMatch}%`;
  parts.push(
    `Resume–JD match analysis: overall ${m.overallMatch}% (skills ${m.skillMatch}%, ${experienceClause}, projects ${m.projectMatch}%, keywords ${m.keywordMatch}%).`,
  );
  if (m.matchedSkills.length) {
    parts.push(`Matched skills: ${m.matchedSkills.slice(0, 12).map((s) => s.skill).join(', ')}.`);
  }
  if (m.partiallyMatchedSkills.length) {
    parts.push(
      `Partially matched: ${m.partiallyMatchedSkills.slice(0, 8).map((s) => `${s.skill} (via ${s.relatedSkill})`).join(', ')}.`,
    );
  }
  if (m.missingSkills.length) {
    parts.push(`Missing skills: ${m.missingSkills.slice(0, 12).map((s) => s.skill).join(', ')}.`);
  }
  if (m.strongAreas.length) {
    parts.push(`Strong areas: ${m.strongAreas.map((a) => a.category).join(', ')}.`);
  }
  if (m.weakAreas.length) {
    parts.push(`Weak areas: ${m.weakAreas.map((a) => a.category).join(', ')}.`);
  }
  if (m.preparationTopics.length) {
    parts.push(`Preparation: ${m.preparationTopics.slice(0, 6).join('; ')}.`);
  }
  return parts.join(' ');
}
