/**
 * JD Parser — deterministic job-description parsing (PDF / TXT / pasted text).
 *
 * Same philosophy as the resume parser: deterministic extraction first,
 * structured output, skills normalized through the shared skill catalog.
 */

import { extractPdfText, cleanText } from './resumeParser';
import { extractSkills, normalizeSkillList, type ExtractedSkill } from './skills';

export interface JdProfile {
  role: string;
  company: string;
  location: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  experience: string;
  educationRequirements: string[];
  toolsTechnologies: string[];
  behavioralRequirements: string[];
  skillDetails: ExtractedSkill[];
  rawText: string;
}

export async function parseJdText(
  text: string,
  company = 'Unknown',
): Promise<JdProfile> {
  const cleaned = cleanText(text);
  const lines = cleaned.split('\n');
  const skillDetails = extractSkills(cleaned, 'JD');

  // Role guess: first few lines, look for "title"/"role" or capitalized line
  let role = '';
  for (const line of lines.slice(0, 12)) {
    const m = line.match(/^(?:title|role|position|job\s*title|about\s*the\s*role)\s*[:：]?\s*(.+)$/i);
    if (m) {
      role = m[1].trim();
      break;
    }
  }
  if (!role) {
    for (const line of lines.slice(0, 6)) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length <= 60 && /^[A-Z][a-z]/.test(trimmed) && !/^[-•\d]/.test(trimmed)) {
        role = trimmed;
        break;
      }
    }
  }
  if (!role) role = 'Software Engineer';

  const responsibilities: string[] = [];
  const behavioralRequirements: string[] = [];
  const toolsTechnologies: string[] = [];
  const experience: string[] = [];
  const educationRequirements: string[] = [];
  const requiredSkills: string[] = [];
  const preferredSkills: string[] = [];

  const behavioralMarkers = /\b(team\s*player|communication|collaborat\w+|leadership|ownership|problem[- ]solving|adaptab\w+|agile|mentor\w+|detail[- ]oriented|self[- ]starter|initiative|presentation)\b/i;
  const experienceMarkers = /\b(?:years?\s*(?:of\s*)?experience|experience\s*in|min\s*\.?\s*\d+\s*\+?\s*(?:years?|yrs))\b/i;
  const educationMarkers = /\b(bachelor|master|b\.?sc|m\.?sc|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|mba|ph\.?d|degree|bca|mca|b\.?a\.?|diploma|undergraduate|graduate)\b/i;

  // Section headings ("Requirements:", "Preferred:", ...) drive skill bucketing
  // so bare bullet skills land in the right bucket even when the bullet itself
  // doesn't repeat the keyword ("- React.js" under "Requirements:").
  const sectionHeadings: Array<{ section: string; re: RegExp }> = [
    { section: 'required', re: /^(requirements?|must have|essential(?: skills)?|minimum qualifications?|qualifications?|required(?: skills)?|technical requirements|job requirements)\b/i },
    { section: 'preferred', re: /^(preferred(?: qualifications?| skills)?|nice[- ]to[- ]have|good[- ]to[- ]have|bonus(?: points)?|plus(?: points)?|additional (?:skills|qualifications))\b/i },
    { section: 'responsibilities', re: /^(responsibilities|key responsibilities|job duties|duties|what you['’]?ll do|what you will do|you will|day[- ]to[- ]day|about the role|the role)\b/i },
    { section: 'education', re: /^(education|educational requirements?|education requirements?)\b/i },
  ];

  function headingSection(line: string): string | null {
    const t = line.replace(/^[-–—•*◦\d.]+[\s)]*/, '').trim();
    for (const h of sectionHeadings) {
      const m = t.match(h.re);
      if (m) {
        const rest = t.slice(m[0].length).replace(/^[:：]/, '').trim();
        if (!rest) return h.section;
      }
    }
    return null;
  }

  let currentSection = '';
  let location = '';

  const locationMarkers = /\b(remote|hybrid|on[- ]site|on site)\b/i;
  const placePattern = /^[A-Z][A-Za-z .'-]+,\s*(?:[A-Z]{2}|india|usa|uae|uk|canada|germany|australia|singapore|japan|france|netherlands|ireland|poland|brazil|berlin|remote|hybrid|karnataka|maharashtra|tamil\s*nadu|california|texas|new\s*york)(?:\s*\([^)]*\))?$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const sectionName = headingSection(line);
    if (sectionName) {
      currentSection = sectionName;
      continue;
    }
    if (!location && i < 15) {
      const locLabel = trimmedLine.match(/^(?:location|office|work\s*(?:location|mode)|based\s*in)\s*[:：]?\s*(.+)$/i);
      if (locLabel) {
        location = locLabel[1].trim().replace(/^[-–—•*]+/, '').slice(0, 60);
      } else if (placePattern.test(trimmedLine) || (locationMarkers.test(trimmedLine) && trimmedLine.split(/\s+/).length <= 6)) {
        location = trimmedLine.slice(0, 60);
      }
    }
    const bullet = line.replace(/^[-–—•*◦\d.]+[\s)]*/, '').trim();
    if (!bullet) continue;

    const skillsOnLine = extractSkills(bullet, 'JD');

    let bucket = currentSection;
    if (/required|must\s*have|essential|minimum\s*qualif|qualifications?/i.test(bullet)) bucket = 'required';
    else if (/preferred|nice[- ]to[- ]have|good[- ]to[- ]have|bonus|plus\b/i.test(bullet)) bucket = 'preferred';
    else if (experienceMarkers.test(bullet)) bucket = 'experience';
    else if (educationMarkers.test(bullet)) bucket = 'education';
    else if (/^(to|you will|your responsibilities|responsibilities|what you['’]?ll do|the role|the work|design|build|develop|lead|own|drive)\b/i.test(bullet) && skillsOnLine.length === 0) bucket = 'responsibilities';

    const addSkill = (arr: string[], skill: string) => {
      if (!arr.includes(skill)) arr.push(skill);
    };

    if (bucket === 'required') {
      for (const s of skillsOnLine) {
        addSkill(requiredSkills, s.skill);
        addSkill(toolsTechnologies, s.skill);
      }
    } else if (bucket === 'preferred') {
      for (const s of skillsOnLine) {
        addSkill(preferredSkills, s.skill);
        addSkill(toolsTechnologies, s.skill);
      }
    } else if (bucket === 'experience') {
      experience.push(bullet.slice(0, 120));
      for (const s of skillsOnLine) {
        addSkill(requiredSkills, s.skill);
        addSkill(toolsTechnologies, s.skill);
      }
    } else if (bucket === 'education') {
      if (educationMarkers.test(bullet)) {
        const edu = bullet.slice(0, 120).replace(/^[-–—•*]+\s*/, '');
        if (!educationRequirements.includes(edu)) educationRequirements.push(edu);
      }
    } else if (bucket === 'responsibilities') {
      if (skillsOnLine.length === 0) responsibilities.push(bullet.slice(0, 200));
    } else if (behavioralMarkers.test(bullet) && skillsOnLine.length === 0) {
      behavioralRequirements.push(bullet.slice(0, 160));
    } else if (skillsOnLine.length) {
      for (const s of skillsOnLine) {
        addSkill(toolsTechnologies, s.skill);
      }
    } else if (!/^[a-z][a-z ]{0,30}[:：]/.test(bullet) && bullet.length < 200) {
      // Unlabeled prose in a loosely formatted JD — treat as a responsibility.
      responsibilities.push(bullet.slice(0, 200));
    }
  }

  return {
    role,
    company,
    location,
    responsibilities: [...new Set(responsibilities)].slice(0, 12),
    requiredSkills: normalizeSkillList([...new Set(requiredSkills)]),
    preferredSkills: normalizeSkillList(preferredSkills),
    experience: experience.join('; '),
    educationRequirements: [...new Set(educationRequirements)].slice(0, 5),
    toolsTechnologies: [...new Set(toolsTechnologies)],
    behavioralRequirements: [...new Set(behavioralRequirements)].slice(0, 8),
    skillDetails,
    rawText: cleaned,
  };
}

export async function parseJdFile(
  buffer: Buffer,
  filename: string,
  mimetype?: string,
): Promise<{ text: string; fileType: 'pdf' | 'text' }> {
  const lower = filename.toLowerCase();
  const isPdf = mimetype === 'application/pdf' || lower.endsWith('.pdf');
  const text = isPdf ? await extractPdfText(buffer) : buffer.toString('utf-8');
  return { text: cleanText(text), fileType: isPdf ? 'pdf' : 'text' };
}

/** Compact human-readable summary of a JD — used for interview context. */
export function summarizeJdProfile(p: JdProfile): string {
  const parts: string[] = [];
  parts.push(`Role: ${p.role}`);
  if (p.company !== 'Unknown') parts.push(`Company: ${p.company}`);
  if (p.location) parts.push(`Location: ${p.location}`);
  if (p.experience) parts.push(`Experience: ${p.experience}`);
  if (p.educationRequirements.length) parts.push(`Education required: ${p.educationRequirements.slice(0, 3).join('; ')}`);
  if (p.requiredSkills.length) parts.push(`Required skills: ${p.requiredSkills.slice(0, 30).join(', ')}`);
  if (p.preferredSkills.length) parts.push(`Preferred skills: ${p.preferredSkills.slice(0, 20).join(', ')}`);
  if (p.toolsTechnologies.length) parts.push(`Tools/Technologies: ${p.toolsTechnologies.slice(0, 25).join(', ')}`);
  if (p.behavioralRequirements.length) parts.push(`Behavioral: ${p.behavioralRequirements.slice(0, 5).join('; ')}`);
  if (p.responsibilities.length) {
    parts.push(`Key responsibilities: ${p.responsibilities.slice(0, 6).map((r) => `- ${r}`).join(' ')}`);
  }
  return parts.join('\n');
}

/**
 * Persisted copy of a JD profile — strips the raw JD text (raw text lives in
 * the session's jd_text column). Applied only when writing to a session record.
 */
export function sanitizeJdProfile(p: JdProfile): JdProfile {
  return { ...p, rawText: '' };
}
