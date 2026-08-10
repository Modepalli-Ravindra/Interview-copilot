/**
 * Resume Parser — deterministic PDF/TXT extraction + structured profile.
 *
 * Text extraction first (pdf-parse for PDFs, plain text for TXT/MD), then
 * section detection, then regex/keyword heuristics to build a structured
 * resume profile. No LLM dependency for the basic parse; AI is only used
 * downstream for semantic enrichment (and never for the core extraction).
 */

import { extractSkills, normalizeSkillList, type ExtractedSkill } from './skills';

// pdf-parse ships a CJS module whose default export is the parser function.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (dataBuffer: Uint8Array, options?: object) => Promise<{ text: string }>;

export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export interface Education {
  degree: string;
  university: string;
  specialization: string;
  graduationYear: string;
  cgpa: string;
}

export interface WorkExperience {
  company: string;
  role: string;
  duration: string;
  responsibilities: string[];
  technologies: string[];
}

export interface Project {
  title: string;
  description: string;
  technologies: string[];
  responsibilities: string[];
  outcomes: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
}

export interface ResumeProfile {
  personal: PersonalInfo;
  summary: string;
  education: Education[];
  skills: string[];
  skillDetails: ExtractedSkill[];
  experience: WorkExperience[];
  internships: WorkExperience[];
  projects: Project[];
  certifications: Certification[];
  rawText: string;
}

export interface ParsedResumeFile {
  filename: string;
  fileType: 'pdf' | 'text';
  size: number;
  text: string;
}

// ──────────────────────────────────────────────────────────────
// Text extraction
// ──────────────────────────────────────────────────────────────

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse's bundled pdf.js (v1.10.x) misreads a raw Node Buffer on modern
    // Node (object offsets come out shifted). Pass a plain Uint8Array copy so
    // the xref table resolves correctly.
    const result = await pdfParse(new Uint8Array(buffer), { max: 0 });
    return result.text || '';
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${(err as Error).message}`);
  }
}

export async function parseResumeFile(
  buffer: Buffer,
  filename: string,
  mimetype?: string,
): Promise<ParsedResumeFile> {
  const lower = filename.toLowerCase();
  const isPdf = mimetype === 'application/pdf' || lower.endsWith('.pdf');
  const text = isPdf ? await extractPdfText(buffer) : buffer.toString('utf-8');
  if (!text || !text.trim()) {
    throw new Error(`No text content could be extracted from ${filename}. Please upload a valid resume (PDF or TXT/MD).`);
  }
  return {
    filename,
    fileType: isPdf ? 'pdf' : 'text',
    size: buffer.length,
    text: cleanText(text),
  };
}

// ──────────────────────────────────────────────────────────────
// Text cleaning
// ──────────────────────────────────────────────────────────────

export function cleanText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[•●▪◦›»]/g, '-')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// ──────────────────────────────────────────────────────────────
// Section detection
// ──────────────────────────────────────────────────────────────

interface SectionHeader {
  name: string;
  patterns: RegExp[];
}

const SECTION_HEADERS: SectionHeader[] = [
  { name: 'education', patterns: [/^(education|academic\s*background|academics|qualifications?|educational\s*qualifications?)\b/i] },
  { name: 'experience', patterns: [/^(work\s*experience|professional\s*experience|employment\s*history|work\s*history|experience)\b/i] },
  { name: 'internships', patterns: [/^(internships?|internship\s*experience|training|industrial\s*training)\b/i] },
  { name: 'projects', patterns: [/^(projects?|academic\s*projects?|personal\s*projects?|key\s*projects?|major\s*projects?)\b/i] },
  { name: 'skills', patterns: [/^(skills|technical\s*skills|core\s*competenc\w+|technologies?|tech\s*stack|expertise|key\s*skills|areas?\s*of\s*expertise|proficienc\w*)\b/i] },
  { name: 'certifications', patterns: [/^(certifications?|certificates?|licenses?|professional\s*certifications?|courses?|trainings?)\b/i] },
  { name: 'summary', patterns: [/^(summary|professional\s*summary|objective|career\s*objective|profile|about\s*me|about)\b/i] },
  { name: 'personal', patterns: [/^(personal\s*details|personal\s*information|contact|contact\s*information|contact\s*details|address)\b/i] },
  { name: 'languages', patterns: [/^(languages?|language\s*proficiency)\b/i] },
  { name: 'awards', patterns: [/^(achievements?|awards?|honors?|recognition|accomplishments?)\b/i] },
  { name: 'publications', patterns: [/^(publications?|papers?|research)\b/i] },
];

function isHeaderLine(line: string): string | null {
  const trimmed = line.trim().replace(/[:：]+$/, '');
  if (trimmed.length > 42) return null;
  for (const h of SECTION_HEADERS) {
    if (h.patterns.some((p) => p.test(trimmed))) return h.name;
  }
  return null;
}

export function detectSections(text: string): Array<{ section: string; lines: string[] }> {
  const lines = text.split('\n');
  const sections: Array<{ section: string; lines: string[] }> = [];
  let current: { section: string; lines: string[] } | null = null;

  for (const line of lines) {
    const header = isHeaderLine(line);
    if (header) {
      current = { section: header, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

// ──────────────────────────────────────────────────────────────
// Field extraction helpers
// ──────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const YEAR_RE = /(?:19|20)\d{2}/g;
const CGPA_RE = /(?:cgpa|gpa|grade|percentage)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/i;

const DEGREE_TERMS = [
  "bachelor of engineering", "b.e.", "be ", "btech", "b.tech", "bachelor of technology",
  "bachelor of science", "b.sc", "bsc", "bca", "bachelor of computer applications",
  "bachelor of arts", "b.a.", "ba ",
  "master of engineering", "m.e.", "me ", "mtech", "m.tech", "master of technology",
  "master of science", "m.sc", "msc", "mca", "master of computer applications",
  "master of business administration", "mba",
  "doctor of philosophy", "ph.d", "phd",
  "diploma", "associate", "bachelor's", "bachelors", "master's", "masters", "btech",
];

function extractName(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim().replace(/[:：,|]+$/g, '');
    if (!trimmed) continue;
    if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) continue;
    if (isHeaderLine(line)) continue;
    if (trimmed.length > 60) continue;
    const words = trimmed.split(/\s+/);
    if (words.length >= 2 && words.length <= 5) {
      return trimmed;
    }
  }
  return '';
}

function extractLocation(lines: string[]): string {
  const locationKeywords = /\b(city|state|country|india|usa|uk|canada|australia|germany|singapore|uae|remote)\b/i;
  for (const line of lines) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (locationKeywords.test(line) && line.split(/\s+/).length <= 6) {
      return line.trim().replace(/^(location|address)\s*[:：]?\s*/i, '');
    }
    if (/^[A-Za-z]+,\s*[A-Za-z\s]{2,20}$/.test(line.trim())) {
      return line.trim();
    }
  }
  return '';
}

function extractSummary(lines: string[]): string {
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) continue;
    if (extractName([trimmed])) continue;
    if (isHeaderLine(line)) continue;
    if (/^(linkedin|github|linkedin\s*\.com|github\.com)\b/i.test(trimmed)) continue;
    kept.push(trimmed.replace(/^[-–—•*]+\s*/, ''));
  }
  return kept.join(' ').slice(0, 400);
}

function parseEducation(lines: string[]): Education[] {
  const results: Education[] = [];
  let current: Partial<Education> | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasDegreeTerm = DEGREE_TERMS.some((t) => lower.includes(t.trim()));
    if (hasDegreeTerm || /^\d{4}\s*[-–—]\s*\d{4}|expected/i.test(lower)) {
      if (current && (current.degree || current.university)) {
        results.push(current as Education);
      }
      current = {};
      const degreeMatch = DEGREE_TERMS.find((t) => lower.includes(t.trim()));
      if (degreeMatch) current.degree = degreeMatch.trim().replace(/\.$/, '');
      const years = line.match(YEAR_RE);
      if (years && years.length) current.graduationYear = years[years.length - 1];
      const cgpa = line.match(CGPA_RE);
      if (cgpa) current.cgpa = cgpa[1] + (cgpa[2] ? `/${cgpa[2]}` : '');
      // university guess: strip leading degree/year tokens from the line
      const cleaned = line
        .replace(new RegExp(DEGREE_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim()).join('|'), 'i'), '')
        .replace(YEAR_RE, '')
        .replace(CGPA_RE, '')
        .replace(/[-|,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length >= 3) current.university = cleaned;
      continue;
    }
    if (!current) continue;
    const cgpa = line.match(CGPA_RE);
    if (cgpa) current.cgpa = cgpa[1] + (cgpa[2] ? `/${cgpa[2]}` : '');
    const years = line.match(YEAR_RE);
    if (years && years.length) current.graduationYear = years[years.length - 1];
    // specialization like "Computer Science", "Information Technology", "AI/ML"
    const specMatch = line.match(/\b(computer\s*science|software\s*engineering|information\s*technology|electronics|electrical|mechanical|civil|ai\/ml|artificial\s*intelligence|data\s*science|information\s*systems|computer\s*applications|communications?)\b/i);
    if (specMatch && !current.specialization) current.specialization = specMatch[1];
    if (!current.university && line.trim().length > 3 && line.trim().length < 60) {
      current.university = line.trim().replace(/[-|]/g, ' ');
    }
  }
  if (current && (current.degree || current.university)) results.push(current as Education);
  return results.map((e) => ({
    degree: e.degree || '',
    university: e.university || '',
    specialization: e.specialization || '',
    graduationYear: e.graduationYear || '',
    cgpa: e.cgpa || '',
  }));
}

const DURATION_RE = /((?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now|till\s*date))|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}\s*[-–—]\s*(?:[a-z]*\.?\s*\d{0,4}|present|current))/i;

function parseRoles(lines: string[], internshipOnly: boolean): WorkExperience[] {
  const roles: WorkExperience[] = [];
  let current: Partial<WorkExperience> | null = null;

  for (const line of lines) {
    const duration = line.match(DURATION_RE);
    if (duration) {
      if (current && (current.company || current.role || current.duration)) roles.push(current as WorkExperience);
      current = { duration: duration[0].replace(/\s+/g, ' ') };
      // Role guess: tokens like "Software Engineer", "Developer", "Intern"
      const roleMatch = line.match(/\b(senior\s+|junior\s+)?(software\s+engineer|full[- ]stack\s+developer|frontend\s+developer|backend\s+developer|front[- ]end\s+developer|back[- ]end\s+developer|devops\s+engineer|data\s+engineer|data\s+scientist|machine\s+learning\s+engineer|ai\s+engineer|intern|trainee|developer|engineer|analyst|consultant|designer|manager|lead|architect)\b/i);
      if (roleMatch) current.role = roleMatch[0];
      const companyMatch = line.replace(duration[0], '').replace(roleMatch ? roleMatch[0] : '', '').replace(/[-|]/g, ' ').replace(/\s+/g, ' ').trim();
      if (companyMatch && companyMatch.split(/\s+/).length <= 5) current.company = companyMatch;
      continue;
    }
    if (!current) continue;
    // Bullet responsibilities
    const bullet = line.replace(/^[-–—•*]+\s*/, '').trim();
    if (bullet.length > 0 && bullet.length < 200) {
      current.responsibilities = current.responsibilities || [];
      current.responsibilities.push(bullet);
      const tech = extractSkills(bullet, 'resume');
      if (tech.length) {
        current.technologies = current.technologies || [];
        for (const t of tech) {
          if (!current.technologies.includes(t.skill)) current.technologies.push(t.skill);
        }
      }
    } else if (!current.company && bullet.length >= 3 && bullet.split(/\s+/).length <= 5) {
      current.company = bullet;
    }
  }
  if (current && (current.company || current.role || current.duration)) roles.push(current as WorkExperience);

  const normalized = roles.map((r) => ({
    company: r.company || '',
    role: r.role || '',
    duration: r.duration || '',
    responsibilities: r.responsibilities || [],
    technologies: r.technologies || [],
  }));

  return internshipOnly ? normalized : normalized;
}

const PROJECT_KEYWORDS = /\b(project|built|developed|created|implemented|designed|engineered|application|platform|system|app|tool|pipeline|dashboard|website|api)\b/i;

function parseProjects(lines: string[]): Project[] {
  const projects: Project[] = [];
  let current: Partial<Project> | null = null;

  for (const line of lines) {
    const isTitle = line.length <= 90 && (PROJECT_KEYWORDS.test(line) || /^[A-Z][A-Za-z0-9 _\-:]+(?:\(.*\))?$/.test(line.trim()));
    if (isTitle && line.trim().length >= 4 && !line.startsWith('-')) {
      if (current && (current.title || current.description)) projects.push(current as Project);
      current = { title: line.trim().replace(/[:：]$/, ''), technologies: [], responsibilities: [], outcomes: [] };
      const tech = extractSkills(line, 'resume');
      if (tech.length) current.technologies = tech.map((t) => t.skill);
      continue;
    }
    if (!current) continue;
    const bullet = line.replace(/^[-–—•*]+\s*/, '').trim();
    if (!bullet) continue;
    const tech = extractSkills(bullet, 'resume');
    if (tech.length) {
      for (const t of tech) {
        if (!current.technologies?.includes(t.skill)) current.technologies?.push(t.skill);
      }
    }
    const isOutcome = /\b(increased|reduced|improved|achieved|boosted|cut|saved|processed|served|handled|deployed|scaled)\b/i.test(bullet) || /(?:%|\d+x|\d+ms|\d+ requests)/i.test(bullet);
    const isResponsibility = /\b(built|developed|created|implemented|integrated|designed|wrote|added|migrated|optimized|maintained)\b/i.test(bullet);
    if (isOutcome && current.outcomes) current.outcomes.push(bullet);
    else if (isResponsibility && current.responsibilities) current.responsibilities.push(bullet);
    else {
      current.description = current.description ? `${current.description} ${bullet}` : bullet;
    }
  }
  if (current && (current.title || current.description)) projects.push(current as Project);
  return projects.map((p) => ({
    title: p.title || '',
    description: (p.description || '').slice(0, 400),
    technologies: p.technologies || [],
    responsibilities: p.responsibilities || [],
    outcomes: p.outcomes || [],
  }));
}

const CERT_DATE_RE = /((?:19|20)\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4})/i;

function parseCertifications(lines: string[]): Certification[] {
  const certs: Certification[] = [];
  for (const line of lines) {
    const bullet = line.replace(/^[-–—•*]+\s*/, '').trim();
    if (!bullet || bullet.length < 3) continue;
    const dateMatch = bullet.match(CERT_DATE_RE);
    const cert: Certification = { name: '', issuer: '', date: dateMatch ? dateMatch[0] : '' };
    let rest = bullet.replace(dateMatch ? dateMatch[0] : '', '');
    // issuer guess: patterns like "Issued by X", "X - Certificate", "... | Coursera | 2021"
    const issuerMatch = rest.match(/\b(issued\s*by|issued\s*:|coursera|udemy|edx|udacity|google|coursera|linkedin|freecodecamp|codecademy|hackerrank|aws|microsoft|oracle|cisco|ibm|datacamp)\b/i);
    if (issuerMatch) {
      const idx = rest.toLowerCase().indexOf(issuerMatch[0].toLowerCase());
      cert.issuer = rest.slice(idx).replace(/^issued\s*by\s*/i, '').replace(/[|,]/g, ' ').trim().slice(0, 60);
      rest = rest.slice(0, idx).trim();
    }
    rest = rest.replace(/^\s*[-–—|•·]\s*/, '');
    cert.name = rest.replace(/[-–—]\s*$/g, '').trim().slice(0, 120);
    if (cert.name) certs.push(cert);
  }
  return certs;
}

// ──────────────────────────────────────────────────────────────
// Main entry: text -> structured ResumeProfile
// ──────────────────────────────────────────────────────────────

export function parseResumeText(text: string, source = 'Resume'): ResumeProfile {
  const cleaned = cleanText(text);
  const lines = cleaned.split('\n');
  const sections = detectSections(cleaned);

  const section = (name: string): string[] => {
    const s = sections.find((x) => x.section === name);
    return s ? s.lines : [];
  };

  const personalLines = section('personal').length
    ? [...section('personal'), ...lines.slice(0, 8)]
    : lines.slice(0, 8);

  const skillsLines = section('skills').length
    ? section('skills').join('\n')
    : cleaned;

  const emailMatch = cleaned.match(EMAIL_RE);
  const phoneMatch = cleaned.match(PHONE_RE);
  const allYears = cleaned.match(YEAR_RE) || [];

  const skills = extractSkills(skillsLines, source);

  // Experience / internship split — internships section or role containing "intern".
  // Poorly formatted resumes with no section headers fall back to scanning the
  // whole text so date-prefixed roles are still captured.
  const rawExperience = section('experience').length
    ? section('experience')
    : section('internships').length
      ? section('internships')
      : lines;
  const internshipLines = section('internships').length ? section('internships') : [];

  return {
    personal: {
      name: extractName(lines),
      email: emailMatch ? emailMatch[0].toLowerCase() : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      location: extractLocation(lines),
    },
    summary: extractSummary(section('summary').length ? section('summary') : lines.slice(0, 10)),
    education: section('education').length ? parseEducation(section('education')) : parseEducation(cleaned.split('\n')),
    skills: normalizeSkillList(skills.map((s) => s.skill)),
    skillDetails: skills,
    experience: parseRoles(rawExperience, false),
    internships: parseRoles(internshipLines, true),
    projects: section('projects').length ? parseProjects(section('projects')) : parseProjects(cleaned.split('\n')),
    certifications: parseCertifications(section('certifications')),
    rawText: cleaned,
  };
}

/** Compact human-readable summary of a resume — used for interview context. */
export function summarizeResumeProfile(p: ResumeProfile): string {
  const parts: string[] = [];
  const personal = p.personal;
  if (personal.name) parts.push(`Name: ${personal.name}`);
  if (personal.email) parts.push(`Email: ${personal.email}`);
  if (personal.phone) parts.push(`Phone: ${personal.phone}`);
  if (personal.location) parts.push(`Location: ${personal.location}`);
  if (p.summary) parts.push(`Summary: ${p.summary}`);

  if (p.skills.length) parts.push(`Skills: ${p.skills.slice(0, 40).join(', ')}`);

  for (const edu of p.education.slice(0, 3)) {
    parts.push(
      `Education: ${[edu.degree, edu.specialization, edu.university, edu.graduationYear, edu.cgpa ? `CGPA ${edu.cgpa}` : '']
        .filter(Boolean).join(', ')}`,
    );
  }

  for (const exp of p.experience.slice(0, 4)) {
    parts.push(
      `Experience: ${[exp.role, exp.company, exp.duration].filter(Boolean).join(' at ')}${
        exp.technologies.length ? ` — ${exp.technologies.join(', ')}` : ''
      }`,
    );
  }
  for (const int of p.internships.slice(0, 2)) {
    parts.push(
      `Internship: ${[int.role, int.company, int.duration].filter(Boolean).join(' at ')}${
        int.technologies.length ? ` — ${int.technologies.join(', ')}` : ''
      }`,
    );
  }
  for (const proj of p.projects.slice(0, 4)) {
    parts.push(
      `Project: ${proj.title}${proj.description ? ` — ${proj.description.slice(0, 160)}` : ''}${
        proj.technologies.length ? ` [${proj.technologies.join(', ')}]` : ''
      }`,
    );
  }
  for (const cert of p.certifications.slice(0, 4)) {
    parts.push(`Certification: ${cert.name}${cert.issuer ? ` (${cert.issuer})` : ''}${cert.date ? ` ${cert.date}` : ''}`);
  }
  return parts.join('\n');
}

/**
 * Persisted copy of a resume profile — strips the raw resume text. The raw
 * text lives in the session's resume_text column; duplicating it inside the
 * structured JSONB profile would defeat the "don't store raw text twice"
 * storage guidance. The parser keeps rawText at runtime (keyword matching),
 * and this is applied only when writing to a session record.
 */
export function sanitizeResumeProfile(p: ResumeProfile): ResumeProfile {
  return { ...p, rawText: '' };
}
