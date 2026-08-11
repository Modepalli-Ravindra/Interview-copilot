/**
 * Phase 5 smoke test — adaptive coding interview flow.
 *
 * Boots the real Express app in-process and exercises the actual routes:
 *   start → hint → submit → complete → next → (repeat) → done
 * Forces the offline JSON-file store + offline code sandbox + mock AI gateway
 * so the whole flow is deterministic (template questions, adaptive difficulty).
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokePhase5.js
 *
 * Backs up backend/data/sessions.json and questions.json and restores on exit.
 */

const fs = require('fs');
const path = require('path');

process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.DATABASE_URL = '';
process.env.AUTH_TEST_MODE = 'true';
process.env.JUDGE0_URL = 'http://127.0.0.1:9'; // closed port → offline fallback
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
React, Node.js, TypeScript, PostgreSQL, Python

EXPERIENCE
Frontend Engineer - WidgetCo - 2019 - Present
- Built a React dashboard used by 2M users

EDUCATION
BSc Computer Science, UT Austin`;

const JD_TEXT = `Software Engineer at WidgetCo
Required: TypeScript, React, Node.js, PostgreSQL, Python
Preferred: Go, AWS, Redis
Responsibilities:
- Build and scale customer-facing web applications
- Design REST APIs and data models`;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}
function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}
function backup(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}
function restore(file, data) {
  if (data !== null) fs.writeFileSync(file, data, 'utf-8');
  else if (fs.existsSync(file)) fs.unlinkSync(file);
}

async function main() {
  const sessBackup = backup(SESSIONS_FILE);
  const qBackup = backup(QUESTIONS_FILE);

  const app = require('../dist/app.js').default;
  const sessionsModule = require('../dist/routes/sessions.js');

  console.log('\n[Phase 5] Adaptive coding interview');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Session with resume + JD → grounded context for generation
    const sessionRes = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'CODING', role: 'Software Engineer', company: 'WidgetCo', resumeText: RESUME_TEXT, jdText: JD_TEXT }),
    });
    const sessionJson = await sessionRes.json();
    const sessionId = sessionJson.data?.id;
    check('POST /api/sessions -> 201', sessionRes.status === 201 && !!sessionId, String(sessionRes.status));

    // 2. Start the interview (3 questions)
    const startRes = await fetch(`${base}/api/coding-interview/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, questionCount: 3, language: 'python' }),
    });
    const startJson = await startRes.json();
    const status1 = startJson.data?.status;
    const q1 = startJson.data?.question;
    check('POST /start -> 200', startRes.status === 200, String(startRes.status) + ' ' + (startJson.error || ''));
    check('Start returns questionNumber 1 / target 3', status1?.questionNumber === 1 && status1?.targetQuestionCount === 3, JSON.stringify({ n: status1?.questionNumber, t: status1?.targetQuestionCount }));
    check('Start question is fully formed', !!q1?.questionId && !!q1?.problemStatement && Array.isArray(q1?.examples), JSON.stringify({ id: q1?.questionId, title: q1?.title }));
    check('Public question hides hidden test payloads', !q1?.hiddenTestCases && typeof q1?.hiddenTestCount === 'number' && q1?.hiddenTestCount > 0, JSON.stringify({ hidden: q1?.hiddenTestCases, count: q1?.hiddenTestCount }));
    check('Public question tags concepts', Array.isArray(q1?.concepts) && q1.concepts.length > 0, JSON.stringify(q1?.concepts));
    check('Difficulty starts at session default', status1?.currentDifficulty === 'Medium', status1?.currentDifficulty);

    // 3. Status endpoint shows the active question
    const statusRes = await fetch(`${base}/api/coding-interview/status/${sessionId}`);
    const statusJson = await statusRes.json();
    check('GET /status shows active question', statusRes.status === 200 && statusJson.data?.question?.questionId === q1?.questionId, JSON.stringify(statusJson.data?.question?.questionId));

    // 4. Hints: two per question, then exhausted
    const hint1 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q1.questionId}/hint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const hint1Json = await hint1.json();
    check('Hint #1 issued', hint1.status === 200 && hint1Json.data?.hint?.hintNumber === 1 && hint1Json.data?.hintsUsed === 1, JSON.stringify(hint1Json.data?.hint));
    const hint2 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q1.questionId}/hint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const hint2Json = await hint2.json();
    check('Hint #2 issued', hint2.status === 200 && hint2Json.data?.hint?.hintNumber === 2 && hint2Json.data?.hintsUsed === 2, JSON.stringify(hint2Json.data?.hint));
    const hint3 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q1.questionId}/hint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    check('Hint #3 rejected (exhausted)', hint3.status === 400, String(hint3.status));

    // 5. Submit a mock (offline) all-pass attempt on Q1
    const sub1 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q1.questionId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: 'def solve():\n    return 42\nprint(solve())', language: 'python', status: 'ACCEPTED', fromMock: true, passedCount: 4, totalCount: 4, visiblePassedCount: 2, visibleTotalCount: 2, hiddenPassedCount: 2, hiddenTotalCount: 2, timeMs: 12, memoryKb: 1000 }),
    });
    const sub1Json = await sub1.json();
    check('Submit records attempt', sub1.status === 200 && sub1Json.data?.attempt?.attemptNumber === 1 && sub1Json.data?.attempt?.passedCount === 4, JSON.stringify(sub1Json.data?.attempt));

    // 6. Complete Q1 → mock signal must NOT move the difficulty
    const comp1 = await fetch(`${base}/api/coding-interview/${sessionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const comp1Json = await comp1.json();
    check('Complete Q1 -> not finished', comp1.status === 200 && comp1Json.data?.finished === false, String(comp1.status) + ' ' + JSON.stringify(comp1Json.data?.finished));
    check('Mock completion does not change difficulty', comp1Json.data?.signal?.classification === 'UNRELIABLE' && comp1Json.data?.decision?.difficulty === 'Medium', JSON.stringify(comp1Json.data?.decision));
    check('Completed question marked in status', comp1Json.data?.status?.questions?.[0]?.status === 'completed', JSON.stringify(comp1Json.data?.status?.questions?.[0]?.status));

    // 7. Next → Q2 (difficulty unchanged)
    const next1 = await fetch(`${base}/api/coding-interview/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const next1Json = await next1.json();
    const q2 = next1Json.data?.question;
    check('Next -> Q2', next1.status === 200 && q2?.questionId && next1Json.data?.status?.questionNumber === 2, String(next1.status) + ' ' + JSON.stringify(q2?.questionId));
    check('Q2 title differs from Q1', q2?.title !== q1?.title, `${q1?.title} vs ${q2?.title}`);

    // 8. Try to request a THIRD question while Q2 is active → 409
    const next409 = await fetch(`${base}/api/coding-interview/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    check('Next while active -> 409', next409.status === 409, String(next409.status));

    // 9. Q2: verified all-pass → STRONG → difficulty rises
    const sub2 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q2.questionId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: 'def solve():\n    return 42\nprint(solve())', language: 'python', status: 'ACCEPTED', fromMock: false, passedCount: 4, totalCount: 4, visiblePassedCount: 2, visibleTotalCount: 2, hiddenPassedCount: 2, hiddenTotalCount: 2, timeMs: 9, memoryKb: 900 }),
    });
    check('Submit Q2 recorded', sub2.status === 200, String(sub2.status));
    const comp2 = await fetch(`${base}/api/coding-interview/${sessionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const comp2Json = await comp2.json();
    check('Verified all-pass -> STRONG', comp2Json.data?.signal?.classification === 'STRONG', JSON.stringify(comp2Json.data?.signal));
    check('Strong performance raises difficulty to Hard', comp2Json.data?.decision?.difficulty === 'Hard', JSON.stringify(comp2Json.data?.decision));

    // 10. Next → Q3 at Hard
    const next2 = await fetch(`${base}/api/coding-interview/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const next2Json = await next2.json();
    const q3 = next2Json.data?.question;
    check('Next -> Q3 at Hard', next2.status === 200 && next2Json.data?.status?.questionNumber === 3 && next2Json.data?.status?.currentDifficulty === 'Hard', JSON.stringify({ n: next2Json.data?.status?.questionNumber, d: next2Json.data?.status?.currentDifficulty }));

    // 11. Q3: verified all-fail → NEEDS_IMPROVEMENT → difficulty drops; interview done
    const sub3 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q3.questionId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: 'def solve():\n    return 1\nprint(solve())', language: 'python', status: 'WRONG_ANSWER', fromMock: false, passedCount: 0, totalCount: 4, visiblePassedCount: 0, visibleTotalCount: 2, hiddenPassedCount: 0, hiddenTotalCount: 2, timeMs: 8, memoryKb: 900 }),
    });
    check('Submit Q3 recorded', sub3.status === 200, String(sub3.status));
    const comp3 = await fetch(`${base}/api/coding-interview/${sessionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const comp3Json = await comp3.json();
    check('All-fail -> NEEDS_IMPROVEMENT', comp3Json.data?.signal?.classification === 'NEEDS_IMPROVEMENT', JSON.stringify(comp3Json.data?.signal));
    check('Weak performance drops difficulty back to Medium', comp3Json.data?.decision?.difficulty === 'Medium', JSON.stringify(comp3Json.data?.decision));
    check('Interview finished after 3 questions', comp3Json.data?.finished === true && comp3Json.data?.status?.completed === true, JSON.stringify({ f: comp3Json.data?.finished, c: comp3Json.data?.status?.completed }));

    // 12. Final status summary
    const finalRes = await fetch(`${base}/api/coding-interview/status/${sessionId}`);
    const finalJson = await finalRes.json();
    const statusFinal = finalJson.data?.status;
    check('Final status: 3 questions, completed', statusFinal?.questions?.length === 3 && statusFinal?.questions?.every((q) => q.status === 'completed') && statusFinal?.completed === true, JSON.stringify(statusFinal?.questions?.map((q) => q.status)));
    check('Per-question pass counts surfaced', statusFinal?.questions?.[2]?.passedCount === 0 && statusFinal?.questions?.[2]?.totalCount === 4, JSON.stringify(statusFinal?.questions?.[2]));

    // 13. Resume-safe start after completion → no new question
    const startAgain = await fetch(`${base}/api/coding-interview/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, questionCount: 3 }),
    });
    const startAgainJson = await startAgain.json();
    check('Re-start after completion returns finished', startAgainJson.data?.finished === true && startAgainJson.data?.question === null, JSON.stringify({ f: startAgainJson.data?.finished, q: startAgainJson.data?.question }));
  } finally {
    await close(server);
    await new Promise((r) => setTimeout(r, 400));
    restore(SESSIONS_FILE, sessBackup);
    restore(QUESTIONS_FILE, qBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Phase 5 smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(2);
  });
