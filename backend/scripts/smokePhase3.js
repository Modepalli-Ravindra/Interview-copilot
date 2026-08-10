/**
 * Phase 3 smoke test — candidates pipeline, roadmap step completion,
 * dynamic coding generation, and hidden-test execution.
 *
 * Boots the real Express app in-process and exercises the actual routes.
 * Forces the offline JSON-file store + offline code sandbox so the test is
 * deterministic and never touches Supabase/Postgres/Judge0.
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokePhase3.js
 *
 * Backs up backend/data/sessions.json and questions.json and restores on exit.
 */

const fs = require('fs');
const path = require('path');

process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.DATABASE_URL = '';
process.env.JUDGE0_URL = 'http://127.0.0.1:9'; // closed port → offline fallback fast & deterministic
// Force deterministic mock mode: providers are only skipped when their env
// URL is literally "disabled", otherwise they try their localhost endpoints
// (which may be live in dev and would turn this into a slow real-AI call).
process.env.OMNIROUTE_URL = 'disabled';
process.env.OPENCODE_SERVER_URL = 'disabled';
process.env.AI_PROVIDER_ORDER = '';

const SESSIONS_FILE = path.resolve(__dirname, '../data/sessions.json');
const QUESTIONS_FILE = path.resolve(__dirname, '../data/questions.json');

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

const RESUME_TEXT = `Jordan Smith
jordan.smith@example.com
Austin, TX

SKILLS
React, Node.js, TypeScript, PostgreSQL

EXPERIENCE
Frontend Engineer - WidgetCo - 2019 - Present
- Built a React dashboard used by 2M users

EDUCATION
BSc Computer Science, UT Austin`;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function backup(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
  return null;
}
function restore(file, data) {
  if (data !== null) fs.writeFileSync(file, data, 'utf-8');
  else if (fs.existsSync(file)) fs.unlinkSync(file);
}

async function main() {
  const sessBackup = backup(SESSIONS_FILE);
  const qBackup = backup(QUESTIONS_FILE);

  let app = require('../dist/app.js').default;
  const sessionsModule = require('../dist/routes/sessions.js');

  console.log('\n[Phase 3] Boot + live routes');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Create a session whose resume carries an email → candidateId derived
    const sessionRes = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'TECHNICAL',
        role: 'Frontend Engineer',
        company: 'WidgetCo',
        resumeText: RESUME_TEXT,
      }),
    });
    const sessionJson = await sessionRes.json();
    const sessionId = sessionJson.data?.id;
    check('POST /api/sessions -> 201', sessionRes.status === 201 && !!sessionId, String(sessionRes.status));
    check('candidateId derived from resume email', sessionJson.data?.candidateId === 'jordan.smith@example.com', JSON.stringify(sessionJson.data?.candidateId));
    check('candidateName + candidateEmail stored', sessionJson.data?.candidateName === 'Jordan Smith' && sessionJson.data?.candidateEmail === 'jordan.smith@example.com', JSON.stringify({ n: sessionJson.data?.candidateName, e: sessionJson.data?.candidateEmail }));

    // 2. Candidate aggregation
    const candidatesRes = await fetch(`${base}/api/candidates`);
    const candidatesJson = await candidatesRes.json();
    const cand = Array.isArray(candidatesJson.data) ? candidatesJson.data.find((c) => c.id === 'jordan.smith@example.com') : null;
    check('GET /api/candidates -> 200', candidatesRes.status === 200, String(candidatesRes.status));
    check('Candidate grouped by derived id', !!cand, JSON.stringify(candidatesJson.data?.map((c) => c.id)));
    check('Candidate shows name/email/sessionCount', cand?.name === 'Jordan Smith' && cand?.email === 'jordan.smith@example.com' && cand?.sessionCount >= 1, JSON.stringify(cand));

    const candDetailRes = await fetch(`${base}/api/candidates/jordan.smith%40example.com`);
    const candDetailJson = await candDetailRes.json();
    check('GET /api/candidates/:id lists sessions', candDetailRes.status === 200 && Array.isArray(candDetailJson.data?.sessions) && candDetailJson.data.sessions.some((s) => s.id === sessionId), String(candDetailRes.status));

    // 3. Roadmap generation → stable step ids
    const roadmapRes = await fetch(`${base}/api/roadmap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const roadmapJson = await roadmapRes.json();
    const steps = roadmapJson.data?.roadmap?.steps || [];
    check('POST /api/roadmap -> 200 with steps', roadmapRes.status === 200 && steps.length > 0, String(roadmapRes.status) + ' ' + (roadmapJson.error || ''));
    check('Every roadmap step has a stable id', steps.length > 0 && steps.every((s) => typeof s.id === 'string' && s.id.length > 0), JSON.stringify(steps.map((s) => s.id)));

    // 4. Step completion PATCH
    const stepId = steps[0]?.id;
    const patchRes = await fetch(`${base}/api/roadmap/${sessionId}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const patchJson = await patchRes.json();
    const patchedStep = (patchJson.data?.roadmap?.steps || []).find((s) => s.id === stepId);
    check('PATCH step -> completed', patchRes.status === 200 && patchedStep?.status === 'completed', JSON.stringify(patchedStep));

    // 5. Dynamic coding generation (offline → template, still fresh + persisted)
    const genRes = await fetch(`${base}/api/coding/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        language: 'python',
        difficulty: 'Medium',
      }),
    });
    const genJson = await genRes.json();
    const q = genJson.data?.question;
    check('POST /api/coding/generate -> 200', genRes.status === 200, String(genRes.status) + ' ' + (genJson.error || ''));
    check('Generated question has id/title/testCases', !!q?.id && !!q?.title && Array.isArray(q?.testCases) && q.testCases.length > 0, JSON.stringify({ id: q?.id, tests: q?.testCases?.length, hidden: q?.hiddenTestCases?.length }));
    check('Generated question splits hidden test cases', Array.isArray(q?.hiddenTestCases) && q.hiddenTestCases.length > 0, JSON.stringify(q?.hiddenTestCases?.length));

    const historyRes = await fetch(`${base}/api/coding/history`);
    const historyJson = await historyRes.json();
    check('GET /api/coding/history records the generated question', Array.isArray(historyJson.data) && historyJson.data.some((e) => e.questionHash === q?.questionHash), JSON.stringify(historyJson.data?.map((e) => e.questionHash)));

    // 6. Execute with hidden test cases (offline sandbox → deterministic pass)
    const visible = q.testCases.slice(0, 2);
    const hidden = q.hiddenTestCases.slice(0, 2);
    const execRes = await fetch(`${base}/api/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_code: 'def solve():\n    return 42\nprint(solve())',
        language: 'python',
        test_cases: visible,
        hidden_test_cases: hidden,
        expected_complexity: q.expectedComplexity,
        session_id: sessionId,
        problem: { id: q.id, title: q.title, difficulty: q.difficulty },
      }),
    });
    const execJson = await execRes.json();
    const run = execJson.data;
    check('POST /api/execute -> 200 with result', execRes.status === 200 && !!run, String(execRes.status));
    check('Execute reports split visible/hidden counts', run?.visibleTotalCount === visible.length && run?.hiddenTotalCount === hidden.length, JSON.stringify({ v: run?.visibleTotalCount, h: run?.hiddenTotalCount }));
    check('Execute combines counts into total', run?.totalCount === visible.length + hidden.length && run?.passedCount === run?.totalCount, JSON.stringify({ t: run?.totalCount, p: run?.passedCount }));

    // 7. Session now carries expectedComplexity + coding execution
    const sessionGet = await fetch(`${base}/api/sessions/${sessionId}`);
    const sessionGetJson = await sessionGet.json();
    check('Session stores expectedComplexity', typeof sessionGetJson.data?.coding?.expectedComplexity === 'string' && sessionGetJson.data.coding.expectedComplexity.length > 0, JSON.stringify(sessionGetJson.data?.coding?.expectedComplexity));
    check('Session stores execution counts', sessionGetJson.data?.coding?.execution?.totalCount === visible.length + hidden.length, JSON.stringify(sessionGetJson.data?.coding?.execution));
  } finally {
    await close(server);
    await new Promise((r) => setTimeout(r, 400));
    restore(SESSIONS_FILE, sessBackup);
    restore(QUESTIONS_FILE, qBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Phase 3 smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(2);
  });
