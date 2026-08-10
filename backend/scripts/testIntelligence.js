/**
 * Phase 2 Intelligence smoke tests — Resume & JD parsing, skill
 * normalization, matching, persistence, and interview-context wiring.
 *
 * Runs against the compiled dist/ (run `npm run build` first):
 *   node scripts/testIntelligence.js
 *
 * Covers the 10 required scenarios. Exits non-zero on failure.
 */

const fs = require('fs');
const path = require('path');

const { parseResumeFile, parseResumeText, summarizeResumeProfile, sanitizeResumeProfile } = require('../dist/services/resumeParser');
const { parseJdText, summarizeJdProfile, sanitizeJdProfile } = require('../dist/services/jdParser');
const { extractSkills, normalizeSkillList, normalizeSkill, getSkillCategory, areRelatedSkills } = require('../dist/services/skills');
const { matchResumeToJd, summarizeMatchReport } = require('../dist/services/matchEngine');
const { createInterviewState, buildSystemPrompt } = require('../dist/services/interviewEngine');
const { createJsonStore } = require('../dist/services/stores/jsonStore');
const { toRow: pgToRow, fromRow: pgFromRow, SCHEMA_SQL } = require('../dist/services/stores/postgresStore');
const { toRow: supabaseToRow, fromRow: supabaseFromRow } = require('../dist/services/stores/supabaseStore');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Minimal-but-valid PDF builder (xref computed) ─────────────
function buildPdf(textLines) {
  const content = textLines.map((t, i) => `BT /F1 12 Tf 72 ${720 - i * 22} Td (${t}) Tj ET`).join('\n');
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  bodies.forEach((b, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += String(o).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ── Sample data ───────────────────────────────────────────────
const RESUME_A = `Alex Johnson
alex.johnson@example.com
+1 555 123 4567
Bengaluru, India

SUMMARY
Senior Full Stack Engineer with 5 years of experience building web applications at scale.

SKILLS
React.js, Node.js, TypeScript, PostgreSQL, AWS, Docker, Git, REST API

EXPERIENCE
Senior Software Engineer - Acme Corp - 2020 - Present
- Built a React dashboard handling 2M requests/day
- Migrated legacy services to Node.js microservices
- Improved API latency by 35%

Software Engineer - Beta Inc - 2017 - 2020
- Developed RESTful APIs with Node.js and PostgreSQL
- Managed CI/CD pipelines with Docker and AWS

PROJECTS
E-Commerce Platform
- Built with React, Node.js, TypeScript
- Scaled to 10,000 concurrent users

EDUCATION
Bachelor of Technology in Computer Science, IIT Delhi, 2013 - 2017, CGPA 8.5

CERTIFICATIONS
AWS Certified Developer - Issued by Amazon - 2021`;

const RESUME_B = `Sam Chen
sam.chen@mail.com

2022 - 2024 Junior Developer at Startup Hub
Built an Android app in Kotlin
Worked with MongoDB and Redis
Learning Python and Machine Learning`;

const RESUME_C = `Priya Patel
priya@x.com

Backend developer specializing in Python, Django, FastAPI, MySQL.
2019 - 2023 worked at FinTech Corp building payment APIs.`;

const JD_A = `Role: Senior Full Stack Engineer
Company: TechCorp

Requirements:
- 5+ years of experience
- React.js
- Node.js
- TypeScript
- PostgreSQL
- RESTful APIs
- AWS

Preferred:
- Kubernetes
- GraphQL
- Kafka

Responsibilities:
- Design and build scalable web applications
- Lead a team of 4 engineers`;

const JD_B = `Job Title: Machine Learning Engineer
Minimum qualifications: 3 years experience
Must have: Python, TensorFlow, PyTorch
Nice to have: MongoDB, Spark, Docker
We are looking for a team player with strong communication skills.`;

const JD_SQL = `Title: Data Engineer
Required: SQL, Python, ETL
Preferred: PostgreSQL
Responsibilities:
- Build data pipelines
- Optimize relational database queries`;

// ── Run scenarios ─────────────────────────────────────────────
(async () => {
  console.log('\n[1] Valid resume PDF parsing');
  const pdfA = buildPdf(RESUME_A.split('\n'));
  const parsedFile = await parseResumeFile(pdfA, 'resume.pdf', 'application/pdf');
  check('PDF text extraction returns content', parsedFile.text.includes('Alex Johnson') && parsedFile.text.includes('React'), 'text=' + JSON.stringify(parsedFile.text.slice(0, 60)));
  check('PDF detected as pdf type', parsedFile.fileType === 'pdf', parsedFile.fileType);
  const profileA = parseResumeText(parsedFile.text, 'Resume');
  check('Personal name extracted', (profileA.personal.name || '').toLowerCase().includes('alex'), profileA.personal.name);
  check('Skills extracted (React via alias)', profileA.skills.includes('React'), JSON.stringify(profileA.skills));
  check('Education parsed', profileA.education.length > 0 && profileA.education[0].university.includes('IIT'), JSON.stringify(profileA.education[0]));

  console.log('\n[2] Poorly formatted resume (no section headers)');
  const profileB = parseResumeText(RESUME_B, 'Resume');
  check('Name still found', (profileB.personal.name || '').toLowerCase().includes('sam'), profileB.personal.name);
  check('Skills found without headers (Kotlin/MongoDB/Python)', ['Kotlin', 'MongoDB', 'Python'].every((s) => profileB.skills.includes(s)), JSON.stringify(profileB.skills));
  check('Experience inferred from durations', profileB.experience.length > 0 && profileB.experience[0].company.includes('Startup Hub'), JSON.stringify(profileB.experience[0]));

  console.log('\n[3] Resume with missing sections (no education/projects)');
  const profileC = parseResumeText(RESUME_C, 'Resume');
  check('Skills detected (Python/Django/MySQL)', ['Python', 'Django', 'MySQL'].every((s) => profileC.skills.includes(s)), JSON.stringify(profileC.skills));
  check('No crash on empty projects/education arrays', Array.isArray(profileC.projects) && Array.isArray(profileC.education));
  check('Experience detected from text', profileC.experience.length > 0, JSON.stringify(profileC.experience));

  console.log('\n[4] Different resume formats (plain TXT + summaries)');
  const summaryA = summarizeResumeProfile(profileA);
  check('Resume summary is non-empty and includes skills', summaryA.includes('Skills:') && summaryA.includes('Alex'), summaryA.slice(0, 80));
  const pdfC = buildPdf(RESUME_C.split('\n'));
  const parsedC = await parseResumeFile(pdfC, 'resume.pdf', 'application/pdf');
  check('Another PDF format parses to a profile', parseResumeText(parsedC.text, 'Resume').skills.includes('Python'));

  console.log('\n[5] Job description parsing');
  const jdA = await parseJdText(JD_A, 'TechCorp');
  check('JD role extracted', jdA.role.includes('Senior Full Stack Engineer'), jdA.role);
  check('JD company set', jdA.company === 'TechCorp', jdA.company);
  check('Required skills parsed', ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'REST API', 'AWS'].every((s) => jdA.requiredSkills.includes(s)), JSON.stringify(jdA.requiredSkills));
  check('Preferred skills parsed', ['Kubernetes', 'GraphQL', 'Kafka'].every((s) => jdA.preferredSkills.includes(s)), JSON.stringify(jdA.preferredSkills));
  check('Responsibilities parsed', jdA.responsibilities.length >= 2, JSON.stringify(jdA.responsibilities.slice(0, 2)));
  const jdB = await parseJdText(JD_B, 'ML Corp');
  check('Second JD format parses (role + required)', jdB.role.toLowerCase().includes('machine learning') && jdB.requiredSkills.includes('Python'), jdB.role + ' / ' + JSON.stringify(jdB.requiredSkills));
  const jdSummary = summarizeJdProfile(jdA);
  check('JD summary non-empty', jdSummary.includes('Role:') && jdSummary.includes('Required skills:'), jdSummary.slice(0, 80));

  console.log('\n[6] Skill normalization (aliases)');
  const norm = normalizeSkillList(['React.js', 'reactjs', 'Node.js', 'node', 'RESTful APIs', 'rest', 'postgres']);
  check('Aliases collapse to canonical names', ['React', 'Node.js', 'REST API', 'PostgreSQL'].every((s) => norm.includes(s)), JSON.stringify(norm));
  check('REST API ≠ REST API (dedupe)', norm.filter((s) => s === 'REST API').length === 1);
  check('React.js → React', normalizeSkill('React.js') === 'React', String(normalizeSkill('React.js')));
  check('RESTful services → REST API', normalizeSkill('RESTful services') === 'REST API', String(normalizeSkill('RESTful services')));
  check('getSkillCategory works', getSkillCategory('React') === 'Frontend', String(getSkillCategory('React')));
  check('Semantic relation: PostgreSQL ~ SQL', areRelatedSkills('PostgreSQL', 'SQL') === true);
  check('Semantic non-relation: Python vs Java', areRelatedSkills('Python', 'Java') === false);
  check('Semantic non-relation: MongoDB vs MySQL', areRelatedSkills('MongoDB', 'MySQL') === false);

  console.log('\n[7] Matching (deterministic scores + partial matches)');
  const matchA = matchResumeToJd(profileA, jdA);
  check('Overall match is a number 0-100', typeof matchA.overallMatch === 'number' && matchA.overallMatch >= 0 && matchA.overallMatch <= 100, String(matchA.overallMatch));
  check('Matched skills include React/Node.js/PostgreSQL/REST API/AWS', ['React', 'Node.js', 'PostgreSQL', 'REST API', 'AWS'].every((s) => matchA.matchedSkills.map((m) => m.skill).includes(s)), JSON.stringify(matchA.matchedSkills));
  check('Missing skills include Kubernetes/GraphQL/Kafka', ['Kubernetes', 'GraphQL', 'Kafka'].every((s) => matchA.missingSkills.map((m) => m.skill).includes(s)), JSON.stringify(matchA.missingSkills));
  check('preparationTopics present', Array.isArray(matchA.preparationTopics) && matchA.preparationTopics.length > 0, JSON.stringify(matchA.preparationTopics));
  check('recommendedTopics aliases preparationTopics', JSON.stringify(matchA.recommendedTopics) === JSON.stringify(matchA.preparationTopics));
  check('generatedAt set', typeof matchA.generatedAt === 'string' && matchA.generatedAt.length > 0);
  // Partial match: JD requires SQL, resume has PostgreSQL
  const profileSql = parseResumeText('Data Dev\nx@x.com\nSkills: Python, PostgreSQL, ETL, Docker', 'Resume');
  const jdSql = await parseJdText(JD_SQL, 'DataCo');
  const matchSql = matchResumeToJd(profileSql, jdSql);
  const partialNames = matchSql.partiallyMatchedSkills.map((p) => p.skill);
  check('Partial match: SQL satisfied via PostgreSQL', partialNames.includes('SQL'), JSON.stringify(matchSql.partiallyMatchedSkills));
  check('Partial match carries relatedSkill', matchSql.partiallyMatchedSkills.find((p) => p.skill === 'SQL')?.relatedSkill === 'PostgreSQL', JSON.stringify(matchSql.partiallyMatchedSkills));
  check('Partial credit raises skill match above full-match-only', matchSql.skillMatch >= 60, String(matchSql.skillMatch));
  const matchSummary = summarizeMatchReport(matchA);
  check('Match summary includes overall score', matchSummary.includes('overall') && matchSummary.includes('%'), matchSummary.slice(0, 100));

  console.log('\n[8] Persistence mapping (Postgres + Supabase)');
  const sanitizedResume = sanitizeResumeProfile(profileA);
  const sanitizedJd = sanitizeJdProfile(jdA);
  check('sanitizeResumeProfile strips rawText', sanitizedResume.rawText === '', 'rawText=' + String(sanitizedResume.rawText.length));
  check('sanitizeJdProfile strips rawText', sanitizedJd.rawText === '');
  const record = {
    id: 'test-session-001', mode: 'JD_BASED', role: 'Senior Full Stack Engineer', company: 'TechCorp',
    candidateId: 'test', resumeText: RESUME_A, jdText: JD_A, githubSummary: '', difficulty: 'Medium',
    skills: profileA.skills.slice(0, 20), resumeProfile: summarizeResumeProfile(profileA),
    jdProfile: summarizeJdProfile(jdA), resumeProfileData: sanitizedResume, jdProfileData: sanitizedJd,
    matchReport: matchA, coding: null, status: 'SETUP', createdAt: new Date().toISOString(),
    startedAt: null, score: null, durationMs: null, feedback: null, roadmap: null, transcript: [],
  };
  const PG_COLUMNS = ['id', 'mode', 'role', 'company', 'candidate_id', 'resume_text', 'jd_text', 'github_summary', 'difficulty', 'skills', 'resume_profile', 'jd_profile', 'resume_profile_data', 'jd_profile_data', 'match_report', 'coding', 'status', 'created_at', 'started_at', 'score', 'duration_ms', 'feedback', 'roadmap', 'transcript'];
  const pgRow = Object.fromEntries(PG_COLUMNS.map((c, i) => [c, pgToRow(record)[i]]));
  const pgBack = pgFromRow(pgRow);
  check('Postgres SCHEMA_SQL has new columns', SCHEMA_SQL.includes('resume_profile_data') && SCHEMA_SQL.includes('jd_profile_data') && SCHEMA_SQL.includes('match_report'));
  check('Postgres toRow/fromRow round-trips resumeProfileData', pgBack.resumeProfileData && pgBack.resumeProfileData.personal.name === 'Alex Johnson', JSON.stringify(pgBack.resumeProfileData && pgBack.resumeProfileData.personal));
  check('Postgres toRow/fromRow round-trips jdProfileData', pgBack.jdProfileData && pgBack.jdProfileData.role.includes('Senior Full Stack'), String(pgBack.jdProfileData && pgBack.jdProfileData.role));
  check('Postgres toRow/fromRow round-trips matchReport', pgBack.matchReport && pgBack.matchReport.overallMatch === matchA.overallMatch, JSON.stringify(pgBack.matchReport && pgBack.matchReport.overallMatch));
  const supabaseRow = supabaseToRow(record);
  const supabaseBack = supabaseFromRow(supabaseRow);
  check('Supabase toRow/fromRow round-trips resumeProfileData', supabaseBack.resumeProfileData && supabaseBack.resumeProfileData.personal.name === 'Alex Johnson');
  check('Supabase toRow/fromRow round-trips matchReport', supabaseBack.matchReport && supabaseBack.matchReport.overallMatch === matchA.overallMatch);

  console.log('\n[9] Persistence + session reload (JSON store)');
  const DATA_FILE = path.resolve(__dirname, '../data/sessions.json');
  let backup = null;
  if (fs.existsSync(DATA_FILE)) backup = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    const store = createJsonStore();
    await store.persist([record]);
    const loaded = await store.load();
    const reloaded = loaded.find((s) => s.id === 'test-session-001');
    check('Record persists to JSON store', !!reloaded, 'not found after load');
    if (reloaded) {
      check('Structured resume profile survives reload', reloaded.resumeProfileData && reloaded.resumeProfileData.personal.name === 'Alex Johnson', JSON.stringify(reloaded.resumeProfileData && reloaded.resumeProfileData.personal));
      check('Structured JD profile survives reload', reloaded.jdProfileData && reloaded.jdProfileData.role.includes('Senior Full Stack'));
      check('Match report survives reload', reloaded.matchReport && reloaded.matchReport.overallMatch === matchA.overallMatch);
      check('Stored profiles do not contain raw text', reloaded.resumeProfileData.rawText === '' && reloaded.jdProfileData.rawText === '');
      check('Raw resume text still persisted separately', reloaded.resumeText.includes('Alex Johnson') && reloaded.resumeText.includes('React'));
    }
  } finally {
    if (backup !== null) fs.writeFileSync(DATA_FILE, backup, 'utf-8');
    else if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  }

  console.log('\n[10] Interview-context wiring');
  const state = await createInterviewState({
    sessionId: 'test-session-001',
    mode: 'JD_BASED', role: 'Senior Full Stack Engineer', company: 'TechCorp',
    resumeText: RESUME_A, jdText: JD_A,
    resumeProfile: summarizeResumeProfile(profileA),
    jdProfile: summarizeJdProfile(jdA),
    matchSummary: summarizeMatchReport(matchA),
    skills: profileA.skills.slice(0, 40),
    difficulty: 'Medium',
  });
  check('createInterviewState preserves matchSummary', state.matchSummary && state.matchSummary.includes('overall'), String(state.matchSummary && state.matchSummary.slice(0, 80)));
  const prompt = buildSystemPrompt({
    ...state,
    resumeText: RESUME_A, jdText: JD_A,
  });
  check('System prompt embeds <match_analysis> block', prompt.includes('<match_analysis>') && prompt.includes('overall'), 'match block missing');
  check('System prompt embeds structured resume profile', prompt.includes('<structured_resume_profile>'));
  check('System prompt embeds structured JD profile', prompt.includes('<structured_jd_profile>'));
  check('System prompt embeds normalized skills', prompt.includes('<normalized_skills>'));
  const matchSummaryShort = summarizeMatchReport(matchA);
  check('Match summary mentions missing skills', matchSummaryShort.includes('Missing skills') && matchSummaryShort.includes('Kubernetes'), matchSummaryShort.slice(0, 200));

  console.log(`\n==== Result: ${passed} passed, ${failed} failed ====\n`);
  if (failed > 0) {
    console.log('Failed checks:', failures.join(' | '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(2);
});
