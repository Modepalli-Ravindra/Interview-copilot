/**
 * End-to-end HTTP smoke test for the Phase 2 intelligence pipeline.
 *
 * Boots the real Express app in-process, exercises the actual routes
 * (multer file upload, JSON parsing, sessions + debounced JSON-store
 * persistence), then simulates a server restart to prove sessions reload
 * with their structured profiles and match report intact.
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokeIntelligence.js
 *
 * Backs up backend/data/sessions.json and restores it on exit.
 */

const fs = require('fs');
const path = require('path');

// Isolate the smoke test from any configured cloud store: force the local
// JSON-file store so we never read or write the real Supabase/Postgres DB or
// the real Supabase S3 bucket. (dotenv will not overwrite keys that already
// exist in process.env.)
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.DATABASE_URL = '';
process.env.SUPABASE_S3_ENDPOINT = '';
process.env.SUPABASE_S3_ACCESS_KEY = '';
process.env.SUPABASE_S3_SECRET_KEY = '';
process.env.AUTH_TEST_MODE = 'true';

const DATA_FILE = path.resolve(__dirname, '../data/sessions.json');

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

const RESUME_TEXT = `Alex Johnson
alex.johnson@example.com
Bengaluru, India

SKILLS
React.js, Node.js, TypeScript, PostgreSQL, AWS, Docker, Git, REST API

EXPERIENCE
Senior Software Engineer - Acme Corp - 2020 - Present
- Built a React dashboard handling 2M requests/day
- Migrated legacy services to Node.js microservices

EDUCATION
Bachelor of Technology in Computer Science, IIT Delhi, 2013 - 2017`;

const JD_TEXT = `Role: Senior Full Stack Engineer
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

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function main() {
  let backup = null;
  if (fs.existsSync(DATA_FILE)) backup = fs.readFileSync(DATA_FILE, 'utf-8');

  let app = require('../dist/app.js').default;
  const sessionsModule = require('../dist/routes/sessions.js');

  console.log('\n[Phase A] Boot + live routes');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health (open, no auth)
    const health = await fetch(`${base}/api/health`);
    check('GET /api/health -> 200', health.status === 200, String(health.status));

    // 2. Resume upload (multipart PDF — exercises the Buffer->Uint8Array fix)
    const pdf = buildPdf(RESUME_TEXT.split('\n'));
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'resume.pdf');
    const resumeRes = await fetch(`${base}/api/intelligence/resume`, { method: 'POST', body: form });
    const resumeJson = await resumeRes.json();
    check('POST /api/intelligence/resume (PDF) -> 200', resumeRes.status === 200, String(resumeRes.status) + ' ' + (resumeJson.error || ''));
    check('Resume profile name extracted', (resumeJson.data?.profile?.personal?.name || '').toLowerCase().includes('alex'), JSON.stringify(resumeJson.data?.profile?.personal));
    check('Resume skills include React (no spurious JavaScript)', resumeJson.data?.skills?.some((s) => s.skill === 'React') && !resumeJson.data?.skills?.some((s) => s.skill === 'JavaScript'), JSON.stringify(resumeJson.data?.skills?.map((s) => s.skill)));
    // Storage behavior depends on whether S3 is configured in the environment.
    if (resumeJson.data?.storageConfigured === true) {
      check('Resume response reports storage configured', resumeJson.data?.storageConfigured === true, JSON.stringify(resumeJson.data?.storageConfigured));
      check('Resume response returns fileKey + fileUrl', typeof resumeJson.data?.resumeFileKey === 'string' && typeof resumeJson.data?.resumeFileUrl === 'string', JSON.stringify(resumeJson.data?.resumeFileKey));
      const dlRes = await fetch(`${base}${resumeJson.data.resumeFileUrl}`);
      const dlBuf = Buffer.from(await dlRes.arrayBuffer());
      check('GET /api/intelligence/resume/file/:key streams the stored file', dlRes.status === 200 && dlBuf.length > 0 && dlBuf.includes(pdf), `${dlRes.status} ${dlBuf.length}B`);
    } else {
      check('Resume response reports storage not configured', resumeJson.data?.storageConfigured === false, JSON.stringify(resumeJson.data?.storageConfigured));
      check('Resume response has null fileKey/fileUrl', resumeJson.data?.resumeFileKey === null && resumeJson.data?.resumeFileUrl === null, JSON.stringify(resumeJson.data?.resumeFileKey));
      const dlRes = await fetch(`${base}/api/intelligence/resume/file/does-not-exist`);
      check('GET /api/intelligence/resume/file/:key -> 503 when unconfigured', dlRes.status === 503, String(dlRes.status));
    }
    const resumeProfile = resumeJson.data?.profile;

    // 3. JD parse (JSON text)
    const jdRes = await fetch(`${base}/api/intelligence/jd`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: JD_TEXT, company: 'TechCorp' }),
    });
    const jdJson = await jdRes.json();
    check('POST /api/intelligence/jd (text) -> 200', jdRes.status === 200, String(jdRes.status) + ' ' + (jdJson.error || ''));
    check('JD required skills parsed', Array.isArray(jdJson.data?.profile?.requiredSkills) && jdJson.data.profile.requiredSkills.includes('React'), JSON.stringify(jdJson.data?.profile?.requiredSkills));
    const jdProfile = jdJson.data?.profile;

    // 4. Match
    const matchRes = await fetch(`${base}/api/intelligence/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resumeProfile, jdProfile }),
    });
    const matchJson = await matchRes.json();
    check('POST /api/intelligence/match -> 200', matchRes.status === 200, String(matchRes.status) + ' ' + (matchJson.error || ''));
    check('Match overall score is a number', typeof matchJson.data?.match?.overallMatch === 'number', JSON.stringify(matchJson.data?.match?.overallMatch));
    check('Match has matched + missing skills', (matchJson.data?.match?.matchedSkills?.length || 0) > 0 && (matchJson.data?.match?.missingSkills?.length || 0) > 0, JSON.stringify(matchJson.data?.match?.matchedSkills));

    // 5. Create a session
    const sessionRes = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'JD_BASED',
        role: 'Senior Full Stack Engineer',
        company: 'TechCorp',
        resumeText: RESUME_TEXT,
        jdText: JD_TEXT,
        resumeFileKey: 'uuid-abc.pdf',
        resumeFileUrl: '/api/intelligence/resume/file/uuid-abc.pdf',
        resumeFileName: 'resume.pdf',
      }),
    });
    const sessionJson = await sessionRes.json();
    const sessionId = sessionJson.data?.id;
    check('POST /api/sessions -> 201', sessionRes.status === 201 && !!sessionId, String(sessionRes.status) + ' ' + (sessionJson.error || ''));
    check('Session computes deterministic matchReport server-side', typeof sessionJson.data?.matchReport?.overallMatch === 'number' && sessionJson.data.matchReport.overallMatch > 0, JSON.stringify(sessionJson.data?.matchReport?.overallMatch));
    check('Session stores structured resumeProfileData', sessionJson.data?.resumeProfileData?.personal?.name === 'Alex Johnson', JSON.stringify(sessionJson.data?.resumeProfileData?.personal));
    check('Session stores structured jdProfileData', Array.isArray(sessionJson.data?.jdProfileData?.requiredSkills) && sessionJson.data.jdProfileData.requiredSkills.length > 0, JSON.stringify(sessionJson.data?.jdProfileData?.requiredSkills));
    check('Stored structured profiles strip raw text', sessionJson.data?.resumeProfileData?.rawText === '' && sessionJson.data?.jdProfileData?.rawText === '');
    check('Session stores resume file fields', sessionJson.data?.resumeFileKey === 'uuid-abc.pdf' && sessionJson.data?.resumeFileUrl === '/api/intelligence/resume/file/uuid-abc.pdf' && sessionJson.data?.resumeFileName === 'resume.pdf', JSON.stringify({ k: sessionJson.data?.resumeFileKey, u: sessionJson.data?.resumeFileUrl, n: sessionJson.data?.resumeFileName }));

    // 6. List contains the session
    const listRes = await fetch(`${base}/api/sessions`);
    const listJson = await listRes.json();
    check('GET /api/sessions lists new session', Array.isArray(listJson.data) && listJson.data.some((s) => s.id === sessionId));

    // 7. Flush debounced persistence so the file is durable before "restart"
    await new Promise((r) => setTimeout(r, 500));
    await sessionsModule.flushSessionStore();
    await close(server);

    // ── Phase B: simulate a server restart — fresh module instance, reload ──
    console.log('\n[Phase B] Restart + reload from store');
    for (const key of Object.keys(require.cache)) {
      if (key.includes(path.sep + 'dist' + path.sep)) delete require.cache[key];
    }
    app = require('../dist/app.js').default;
    const sessionsModule2 = require('../dist/routes/sessions.js');
    await sessionsModule2.initSessionStore();

    const { server: server2, port: port2 } = await listen(app);
    const base2 = `http://127.0.0.1:${port2}`;
    try {
      const reloadRes = await fetch(`${base2}/api/sessions/${sessionId}`);
      const reloadJson = await reloadRes.json();
      const r = reloadJson.data;
      check('GET /api/sessions/:id after restart -> 200', reloadRes.status === 200, String(reloadRes.status));
      check('Session reloads raw texts', (r?.resumeText || '').includes('Alex Johnson') && (r?.jdText || '').includes('Senior Full Stack'), '');
      check('Session reloads structured resumeProfileData', r?.resumeProfileData?.personal?.name === 'Alex Johnson', JSON.stringify(r?.resumeProfileData?.personal));
      check('Session reloads structured jdProfileData', Array.isArray(r?.jdProfileData?.requiredSkills) && r.jdProfileData.requiredSkills.includes('PostgreSQL'), JSON.stringify(r?.jdProfileData?.requiredSkills));
      check('Session reloads matchReport', typeof r?.matchReport?.overallMatch === 'number' && r.matchReport.overallMatch === sessionJson.data.matchReport.overallMatch, JSON.stringify(r?.matchReport?.overallMatch) + ' vs ' + JSON.stringify(sessionJson.data.matchReport.overallMatch));
      check('Reloaded structured profiles still strip raw text', r?.resumeProfileData?.rawText === '' && r?.jdProfileData?.rawText === '');
      check('Session reloads resume file fields', r?.resumeFileKey === 'uuid-abc.pdf' && r?.resumeFileUrl === '/api/intelligence/resume/file/uuid-abc.pdf', JSON.stringify(r?.resumeFileKey));
    } finally {
      await close(server2);
    }
  } finally {
    if (backup !== null) fs.writeFileSync(DATA_FILE, backup, 'utf-8');
    else if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  }
}

main()
  .then(() => {
    console.log(`\n==== Smoke result: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(2);
  });
