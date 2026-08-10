/**
 * Phase 4 Intelligence tests — resume parsing edge cases, JD enrichment
 * (location + education requirements), deterministic matching (weak / no-overlap /
 * insufficient-experience / required-vs-preferred weighting / aliases), and
 * interview-context grounding of the extracted profiles.
 *
 * Runs against the compiled dist/ (run `npm run build` first):
 *   node scripts/testResumeJdMatch.js
 *
 * Exits non-zero on failure.
 */

const fs = require('fs');
const path = require('path');

const { parseResumeFile, parseResumeText, summarizeResumeProfile, sanitizeResumeProfile } = require('../dist/services/resumeParser');
const { parseJdFile, parseJdText, summarizeJdProfile, sanitizeJdProfile } = require('../dist/services/jdParser');
const { matchResumeToJd, summarizeMatchReport } = require('../dist/services/matchEngine');
const { createInterviewState, buildSystemPrompt } = require('../dist/services/interviewEngine');

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

async function assertRejects(fn, messageIncludes) {
  try {
    await fn();
    return { ok: false, detail: 'did not throw' };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return { ok: msg.toLowerCase().includes(messageIncludes.toLowerCase()), detail: msg.slice(0, 160) };
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
const RESUME_FULL = `Alex Johnson
alex.johnson@example.com
+1 555 123 4567
San Francisco, CA

SUMMARY
Senior Full Stack Engineer with 5+ years of experience building web applications at scale.

SKILLS
React.js, Node.js, TypeScript, PostgreSQL, AWS, Docker, Git, REST API

EXPERIENCE
Senior Software Engineer - Acme Corp - 2020 - Present
- Built a React dashboard handling 2M requests/day
- Migrated legacy services to Node.js microservices

Software Engineer - Beta Inc - 2017 - 2020
- Developed RESTful APIs with Node.js and PostgreSQL

PROJECTS
E-Commerce Platform
- Built with React, Node.js, TypeScript
- Scaled to 10,000 concurrent users

EDUCATION
Bachelor of Technology in Computer Science, IIT Delhi, 2013 - 2017, CGPA 8.5`;

const RESUME_DATED = `Sam Chen
sam.chen@mail.com

SKILLS
Python, Django, PostgreSQL

PROJECTS
REST API
- Built with Django, PostgreSQL`;

const RESUME_NO_OVERLAP = `Riya Sharma
riya@example.com

SKILLS
C++, MATLAB

PROJECTS
Embedded Controller
- Wrote firmware in C++
- Reduced boot time by 40%`;

const RESUME_MONTH = `Meera Nair
meera@mail.com

SKILLS
Python, Flask

EXPERIENCE
Backend Intern - Acme - Jun 2023 - Dec 2023
- Built Flask APIs`;

const RESUME_ENTRY = `Fresh Grad
fresh@mail.com

EXPERIENCE
Software Engineer Intern - Startup - 2023 - 2024
- Built features with Python and React`;

const RESUME_ALIAS = `Kim Lee
kim@mail.com

SKILLS
React.js, Node.js, TypeScript, PostgreSQL, Docker, AWS`;

const RESUME_WEAK = `Pat Doe
pat@mail.com

SKILLS
Python, Django`;

const JD_ALIAS = `Title: Full Stack Engineer
Requirements:
- ReactJS
- NodeJS
- TypeScript
- PostgreSQL
- Docker
- AWS`;

const JD_NO_EXP = `Title: Data Engineer
Required: SQL, Python, ETL`;

const JD_ENTRY = `Title: Junior Developer
Requirements:
- 0-2 years of experience
- Python
- React`;

const JD_2_YEARS = `Title: Backend Developer
Requirements:
- 2+ years of experience
- Python
- Flask`;

const JD_3_YEARS = `Title: Platform Engineer
Requirements:
- 3+ years of experience
- Python
- Django
- PostgreSQL`;

const JD_REQ_MISSING = `Title: Full Stack Engineer
Requirements:
- React
- Node.js
- Kubernetes
Preferred:
- Kafka`;

const JD_PREF_MISSING = `Title: Full Stack Engineer
Requirements:
- React
- Node.js
Preferred:
- Kafka
- Elasticsearch`;

const JD_LOCATION = `Job Title: Frontend Developer
Company: Acme Corp
Location: San Francisco, CA (Hybrid)
Requirements:
- React.js
- TypeScript
Education:
- Bachelor's degree in Computer Science or equivalent`;

(async () => {
  console.log('\n[1] Malformed / empty inputs fail clearly');
  const badPdf = await assertRejects(() => parseResumeFile(Buffer.from('definitely not a pdf file'), 'broken.pdf', 'application/pdf'), 'extract');
  check('Malformed PDF rejects with a clear error', badPdf.ok, badPdf.detail);
  const emptyText = await assertRejects(() => parseResumeFile(Buffer.from(''), 'empty.txt'), 'no text content');
  check('Empty text file rejects with a clear error', emptyText.ok, emptyText.detail);
  const emptyPdf = await assertRejects(() => parseResumeFile(buildPdf([]), 'blank.pdf', 'application/pdf'), 'extract');
  check('PDF with no extractable text rejects (no empty profile)', emptyPdf.ok || /no text content/i.test(emptyPdf.detail), emptyPdf.detail);

  console.log('\n[2] Resume: summary, projects, education');
  const resumeFull = parseResumeText(RESUME_FULL, 'Resume');
  check('Summary extracted from SUMMARY section', resumeFull.summary.length > 0 && resumeFull.summary.includes('5+'), resumeFull.summary.slice(0, 120));
  check('Project title extracted', resumeFull.projects.length > 0 && resumeFull.projects[0].title.includes('E-Commerce'), JSON.stringify(resumeFull.projects[0] && resumeFull.projects[0].title));
  check('Project technologies extracted', resumeFull.projects[0].technologies.includes('React') && resumeFull.projects[0].technologies.includes('Node.js'), JSON.stringify(resumeFull.projects[0].technologies));
  check('Project outcomes captured', resumeFull.projects[0].outcomes.length >= 1, JSON.stringify(resumeFull.projects[0].outcomes));
  const edu = resumeFull.education[0];
  check('Education degree parsed', !!edu && edu.degree.toLowerCase().includes('bachelor'), JSON.stringify(edu && edu.degree));
  check('Education university parsed', !!edu && edu.university.includes('IIT Delhi'), JSON.stringify(edu && edu.university));
  check('Education CGPA parsed', !!edu && edu.cgpa.includes('8.5'), JSON.stringify(edu && edu.cgpa));
  check('Education graduation year parsed', !!edu && edu.graduationYear === '2017', JSON.stringify(edu && edu.graduationYear));

  console.log('\n[3] JD enrichment: PDF input, location, education requirements');
  const jdPdfBuffer = buildPdf(JD_LOCATION.split('\n'));
  const jdFile = await parseJdFile(jdPdfBuffer, 'Frontend.pdf', 'application/pdf');
  check('JD PDF parses to text', jdFile.fileType === 'pdf' && jdFile.text.includes('Frontend Developer'), jdFile.text.slice(0, 80));
  const jdLoc = await parseJdText(jdFile.text, 'Acme Corp');
  check('JD role extracted from PDF', jdLoc.role.includes('Frontend'), jdLoc.role);
  check('JD location extracted', jdLoc.location.length > 0 && jdLoc.location.includes('San Francisco'), jdLoc.location);
  check('JD location includes work mode', /hybrid|remote/i.test(jdLoc.location), jdLoc.location);
  check('JD education requirement extracted', jdLoc.educationRequirements.length > 0 && jdLoc.educationRequirements[0].includes('Bachelor'), JSON.stringify(jdLoc.educationRequirements));
  check('JD required skills parsed', jdLoc.requiredSkills.includes('React'), JSON.stringify(jdLoc.requiredSkills));

  console.log('\n[4] Matching: strong vs weak vs no overlap');
  const resumeAlias = parseResumeText(RESUME_ALIAS, 'Resume');
  const jdAlias = await parseJdText(JD_ALIAS);
  const strong = matchResumeToJd(resumeAlias, jdAlias);
  check('Strong match scores 100% skills', strong.skillMatch === 100, `skillMatch=${strong.skillMatch}`);
  check('Cross-alias matching: ReactJS JD vs React.js resume both match', strong.matchedSkills.some((s) => s.skill === 'React'), JSON.stringify(strong.matchedSkills.slice(0, 6)));
  check('Cross-alias matching: NodeJS JD vs Node.js resume', strong.matchedSkills.some((s) => s.skill === 'Node.js'), JSON.stringify(strong.matchedSkills.slice(0, 6)));
  check('Strong match overall high', strong.overallMatch >= 60, `overall=${strong.overallMatch}`);

  const weak = matchResumeToJd(parseResumeText(RESUME_WEAK, 'Resume'), jdAlias);
  check('Weak match scores well below strong', weak.skillMatch < strong.skillMatch, `weak=${weak.skillMatch} strong=${strong.skillMatch}`);
  check('Weak match missing skills populated', weak.missingSkills.length >= 4, `missing=${weak.missingSkills.length}`);

  const noOverlap = matchResumeToJd(parseResumeText(RESUME_NO_OVERLAP, 'Resume'), jdAlias);
  check('No skill overlap scores 0% skills', noOverlap.skillMatch === 0, `skillMatch=${noOverlap.skillMatch}`);
  check('No overlap: matched list empty', noOverlap.matchedSkills.length === 0, `matched=${noOverlap.matchedSkills.length}`);
  check('No overlap: all JD skills listed missing', noOverlap.missingSkills.length === jdAlias.requiredSkills.length, `missing=${noOverlap.missingSkills.length}`);

  console.log('\n[5] Matching: experience insufficiency + entry-level ranges');
  const noExpMatch = matchResumeToJd(parseResumeText(RESUME_DATED, 'Resume'), await parseJdText(JD_NO_EXP));
  check('JD with no years requirement flags insufficient experience', noExpMatch.experienceInsufficient === true, JSON.stringify(noExpMatch.experienceInsufficient));
  check('Insufficient experience scores 0 (no invented 70)', noExpMatch.experienceMatch === 0, `experienceMatch=${noExpMatch.experienceMatch}`);
  check('Overall still a valid number when experience is insufficient', typeof noExpMatch.overallMatch === 'number' && noExpMatch.overallMatch >= 0 && noExpMatch.overallMatch <= 100, `overall=${noExpMatch.overallMatch}`);

  const datedReq = matchResumeToJd(parseResumeText(RESUME_DATED, 'Resume'), await parseJdText(JD_3_YEARS));
  check('JD requires years but resume has no dated roles -> insufficient', datedReq.experienceInsufficient === true, JSON.stringify(datedReq.experienceInsufficient));

  const monthMatch = matchResumeToJd(parseResumeText(RESUME_MONTH, 'Resume'), await parseJdText(JD_2_YEARS));
  check('Month-precise experience (Jun-Dec 2023) computed as 0.5yr', !monthMatch.experienceInsufficient && monthMatch.experienceMatch === 25, `experienceMatch=${monthMatch.experienceMatch} insufficient=${monthMatch.experienceInsufficient}`);

  const entryMatch = matchResumeToJd(parseResumeText(RESUME_ENTRY, 'Resume'), await parseJdText(JD_ENTRY));
  check('Entry-level JD (0-2 years) floors fresh-grad experience at 50', !entryMatch.experienceInsufficient && entryMatch.experienceMatch >= 50, `experienceMatch=${entryMatch.experienceMatch} insufficient=${entryMatch.experienceInsufficient}`);

  console.log('\n[6] Matching: required vs preferred skill weighting');
  const reqMissing = matchResumeToJd(resumeAlias, await parseJdText(JD_REQ_MISSING));
  const prefMissing = matchResumeToJd(resumeAlias, await parseJdText(JD_PREF_MISSING));
  check('Missing required skill drops score more than missing preferred', reqMissing.skillMatch < prefMissing.skillMatch, `reqMissing=${reqMissing.skillMatch} prefMissing=${prefMissing.skillMatch}`);
  check('Required-skills gap computed deterministically', reqMissing.skillMatch === 57, `reqMissing=${reqMissing.skillMatch}`);
  check('Preferred-skills gap computed deterministically', prefMissing.skillMatch === 67, `prefMissing=${prefMissing.skillMatch}`);

  console.log('\n[7] Interview context carries the enriched profiles');
  const jdLocForCtx = await parseJdText(JD_LOCATION);
  const state = await createInterviewState({
    sessionId: 'test-phase4',
    mode: 'JD_BASED', role: 'Frontend Developer', company: 'Acme Corp',
    resumeText: RESUME_FULL, jdText: JD_LOCATION,
    resumeProfile: summarizeResumeProfile(resumeFull),
    jdProfile: summarizeJdProfile(jdLocForCtx),
    matchSummary: summarizeMatchReport(noExpMatch),
    skills: resumeFull.skills.slice(0, 40),
    difficulty: 'Medium',
  });
  check('JD location reaches interview context', state.jdProfile.includes('San Francisco'), state.jdProfile.slice(0, 120));
  check('JD education requirement reaches interview context', state.jdProfile.includes('Bachelor'), state.jdProfile.slice(0, 120));
  check('Resume summary reaches interview context', state.resumeProfile.includes('5+ years'), state.resumeProfile.slice(0, 120));
  check('Insufficient-experience note reaches interview context', state.matchSummary.includes('not enough information'), state.matchSummary.slice(0, 160));

  const prompt = buildSystemPrompt({ ...state, resumeText: RESUME_FULL, jdText: JD_LOCATION });
  check('Prompt embeds structured JD profile', prompt.includes('<structured_jd_profile>') && prompt.includes('San Francisco'), 'jd block missing');
  check('Prompt embeds structured resume profile', prompt.includes('<structured_resume_profile>') && prompt.includes('5+ years'), 'resume block missing');
  check('Prompt embeds match analysis with insufficiency note', prompt.includes('<match_analysis>') && prompt.includes('not enough information'), 'match block missing');

  console.log(`\n==== Result: ${passed} passed, ${failed} failed ====\n`);
  if (failed > 0) {
    console.log('Failed checks:', failures.join(' | '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(2);
});
