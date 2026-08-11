/**
 * Phase 5 metrics + feedback smoke test.
 *
 * Exercises the deterministic metrics builder, the coding-interview execution
 * path (server-side hidden tests + attempt recording), and the end-of-interview
 * feedback endpoint end-to-end:
 *   - session (CODING_INTERVIEW mode) → start → /api/execute (offline) →
 *     /submit verified → complete → next → /feedback → persisted session.
 *
 * Truthfulness assertions:
 *   - hidden tests are resolved server-side only (client-supplied hidden cases
 *     are ignored for coding-interview runs);
 *   - the reference attempt is the last verified (non-mock) one, never a later
 *     offline fallback "all-pass";
 *   - the persisted session.score equals the deterministic metrics score.
 *
 * Forces offline store + offline code sandbox + mock AI gateway. Backs up
 * backend/data/sessions.json and questions.json and restores on exit.
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

  console.log('\n[Phase 5] Metrics + feedback');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  const base = `http://127.0.0.1:${port}`;

  const CODE = 'def solution():\n    # long enough to satisfy the offline sandbox gate\n    return sorted([x for x in range(10) if x % 2 == 0])\nprint(solution())\n';

  try {
    // 1. Session in CODING_INTERVIEW mode
    const sessionRes = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'CODING_INTERVIEW', role: 'Software Engineer', company: 'WidgetCo', resumeText: RESUME_TEXT, jdText: JD_TEXT }),
    });
    const sessionJson = await sessionRes.json();
    const sessionId = sessionJson.data?.id;
    check('POST /api/sessions accepts CODING_INTERVIEW mode', sessionRes.status === 201 && !!sessionId, String(sessionRes.status));
    check('Session stored with mode CODING_INTERVIEW', sessionJson.data?.mode === 'CODING_INTERVIEW', sessionJson.data?.mode);

    // 2. Start interview (3 questions)
    const startRes = await fetch(`${base}/api/coding-interview/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, questionCount: 3, language: 'python' }),
    });
    const startJson = await startRes.json();
    const q1 = startJson.data?.question;
    const hiddenCount1 = q1?.hiddenTestCount;
    check('Start -> Q1 with server-side hidden test count', startRes.status === 200 && !!q1?.questionId && typeof hiddenCount1 === 'number' && hiddenCount1 > 0, JSON.stringify(q1?.questionId));

    // 3. Run via /api/execute with a spoofed client hidden-test payload.
    //    Server must resolve hidden tests from its own state (count == hiddenTestCount).
    const runRes = await fetch(`${base}/api/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_code: CODE,
        language: 'python',
        test_cases: [],
        hidden_test_cases: Array(99).fill({ stdin: '1', expected: '1' }),
        coding_interview_session_id: sessionId,
        coding_interview_question_id: q1.questionId,
      }),
    });
    const runJson = await runRes.json();
    const run = runJson.data;
    check('Execute accepts coding-interview run', runRes.status === 200 && !!run, JSON.stringify(runJson.error || runJson.data));
    check('Hidden tests resolved server-side (client payload ignored)', run?.hiddenTotalCount === hiddenCount1 && run?.hiddenTotalCount !== 99, JSON.stringify({ server: hiddenCount1, reported: run?.hiddenTotalCount }));
    check('Offline sandbox flagged as mock', run?.fromMock === true, String(run?.fromMock));

    // 4. Attempt recorded against the question
    const st1 = await fetch(`${base}/api/coding-interview/status/${sessionId}`);
    const st1Json = await st1.json();
    check('Attempt appended to active question', st1Json.data?.question?.attemptsCount === 1, String(st1Json.data?.question?.attemptsCount));

    // 4b. Refresh/resume — /start again returns the SAME active question (resumed)
    const resumeRes = await fetch(`${base}/api/coding-interview/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, questionCount: 3, language: 'python' }),
    });
    const resumeJson = await resumeRes.json();
    check('Refresh/resume: /start resumes the active question', resumeRes.status === 200 && resumeJson.data?.resumed === true && resumeJson.data?.question?.questionId === q1.questionId, JSON.stringify({ resumed: resumeJson.data?.resumed, id: resumeJson.data?.question?.questionId }));
    const st1c = await fetch(`${base}/api/coding-interview/status/${sessionId}`);
    const st1cJson = await st1c.json();
    check('Refresh/resume: attempts persist across reload', st1cJson.data?.question?.attemptsCount === 1, String(st1cJson.data?.question?.attemptsCount));

    // 5. Legacy practice field must NOT be written for coding-interview runs
    const sess1 = await fetch(`${base}/api/sessions/${sessionId}`);
    const sess1Json = await sess1.json();
    check('session.coding untouched (practice mode isolated)', sess1Json.data?.coding == null, JSON.stringify(sess1Json.data?.coding));

    // 6. Verified partial pass on Q1 (3/4) — must become the reference attempt
    const sub1 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q1.questionId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: CODE, language: 'python', status: 'WRONG_ANSWER', fromMock: false, passedCount: 3, totalCount: 4, visiblePassedCount: 2, visibleTotalCount: 2, hiddenPassedCount: 1, hiddenTotalCount: 2, timeMs: 10, memoryKb: 800 }),
    });
    check('Verified submit recorded on Q1', sub1.status === 200, String(sub1.status));
    const st1b = await fetch(`${base}/api/coding-interview/status/${sessionId}`);
    const st1bJson = await st1b.json();
    check('Q1 now has 2 attempts', st1bJson.data?.question?.attemptsCount === 2, String(st1bJson.data?.question?.attemptsCount));

    // 7. Complete Q1 → STABLE (0.75 pass rate), then Q2
    const comp1 = await fetch(`${base}/api/coding-interview/${sessionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const comp1Json = await comp1.json();
    check('Q1 -> STABLE (verified 3/4 reference)', comp1Json.data?.signal?.classification === 'STABLE', JSON.stringify(comp1Json.data?.signal?.classification));
    const next1 = await fetch(`${base}/api/coding-interview/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const next1Json = await next1.json();
    const q2 = next1Json.data?.question;
    check('Next -> Q2', next1.status === 200 && !!q2?.questionId, String(next1.status));

    // 8. Verified all-fail on Q2, complete, next -> Q3
    const sub2 = await fetch(`${base}/api/coding-interview/${sessionId}/questions/${q2.questionId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCode: CODE, language: 'python', status: 'WRONG_ANSWER', fromMock: false, passedCount: 0, totalCount: 4, visiblePassedCount: 0, visibleTotalCount: 2, hiddenPassedCount: 0, hiddenTotalCount: 2, timeMs: 8, memoryKb: 900 }),
    });
    check('Verified submit recorded on Q2', sub2.status === 200, String(sub2.status));
    const comp2 = await fetch(`${base}/api/coding-interview/${sessionId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const comp2Json = await comp2.json();
    check('Q2 -> NEEDS_IMPROVEMENT', comp2Json.data?.signal?.classification === 'NEEDS_IMPROVEMENT', JSON.stringify(comp2Json.data?.signal?.classification));
    const next2 = await fetch(`${base}/api/coding-interview/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const next2Json = await next2.json();
    const q3 = next2Json.data?.question;
    check('Next -> Q3', next2.status === 200 && !!q3?.questionId, String(next2.status));

    // 9. Feedback — auto-completes active Q3, builds deterministic report
    const fbRes = await fetch(`${base}/api/coding-interview/${sessionId}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const fbJson = await fbRes.json();
    const report = fbJson.data?.report;
    const ci = fbJson.data?.codingInterview;
    const m = ci?.metrics;
    check('Feedback endpoint returns report', fbRes.status === 200 && !!report && !!ci, String(fbRes.status) + ' ' + (fbJson.error || ''));
    check('Feedback is deterministic mock (no AI provider)', report?.feedbackSource === 'mock', report?.feedbackSource);

    // Truthfulness: reference attempt = verified 3/4 (NOT the offline all-pass)
    check('Reference attempt is verified (3/4, not mock 4/4)', ci?.questions?.[0]?.passedCount === 3 && ci?.questions?.[0]?.totalCount === 4 && ci?.questions?.[0]?.fromMock === false, JSON.stringify(ci?.questions?.[0]));
    check('Verified question count = 2, mock = 1', ci?.verifiedQuestionCount === 2 && ci?.mockQuestionCount === 1, JSON.stringify({ v: ci?.verifiedQuestionCount, m: ci?.mockQuestionCount }));
    check('hasVerifiedExecution true', ci?.hasVerifiedExecution === true, String(ci?.hasVerifiedExecution));

    // Deterministic aggregate numbers
    check('questionsAttempted = 2 (Q3 had no runs)', m?.questionsAttempted === 2, String(m?.questionsAttempted));
    check('totalTests = 8, passed = 3', m?.totalTests === 8 && m?.totalTestsPassed === 3, JSON.stringify({ t: m?.totalTests, p: m?.totalTestsPassed }));
    check('averageAttempts = 1.5 (Q1:2, Q2:1, Q3:0)', m?.averageAttempts === 1.5, String(m?.averageAttempts));
    check('overallScore = 32 (0.6*37.5 + 0.3*0 + 0.1*96)', m?.overallScore === 32, String(m?.overallScore));
    check('report.score equals metrics score (server truth)', report?.score === m?.overallScore, JSON.stringify({ r: report?.score, m: m?.overallScore }));
    check('Coding dimension added with server score', (report?.dimensions || []).some((d) => d.label === 'Coding' && d.value === m?.overallScore), JSON.stringify(report?.dimensions));
    check('Per-question report has 3 entries', Array.isArray(ci?.questions) && ci.questions.length === 3, String(ci?.questions?.length));

    // 10. Persisted session — status/score/feedback all server truth
    const sessFinal = await fetch(`${base}/api/sessions/${sessionId}`);
    const sessFinalJson = await sessFinal.json();
    const s = sessFinalJson.data;
    check('Session status COMPLETED', s?.status === 'COMPLETED', s?.status);
    check('Session score matches metrics', s?.score === 32, String(s?.score));
    check('Session feedback carries codingInterview report', s?.feedback?.codingInterview?.metrics?.overallScore === 32, JSON.stringify(s?.feedback?.codingInterview?.metrics?.overallScore));

    // 11. Feedback is idempotent (repeat call still 200)
    const fb2 = await fetch(`${base}/api/coding-interview/${sessionId}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    check('Repeat feedback call returns 200', fb2.status === 200, String(fb2.status));

    // 12. LIVE-path provenance — server-computed metrics must override an AI report
    //     (guards the generateFeedback AI branch, which reassigns the report)
    const { applyCodingInterviewDerived } = require('../dist/services/feedback.js');
    const fakeAiReport = {
      summary: 'AI narrative', score: 85,
      dimensions: [{ label: 'Technical', value: 80 }, { label: 'Coding', value: 90 }],
      breakdown: [], strengths: ['AI strength'], gaps: [], tips: [], nextTopics: [],
      strongAnswers: [], weakAnswers: [], recommendedCodingPractice: [], recommendedInterviewQuestions: [],
    };
    const overridden = applyCodingInterviewDerived(fakeAiReport, ci);
    check('LIVE path: AI score overridden by server metrics', overridden.score === 32, String(overridden.score));
    const codingDims = overridden.dimensions.filter((d) => d.label === 'Coding');
    check('LIVE path: Coding dimension deduped + server-derived', codingDims.length === 1 && codingDims[0].value === 32, JSON.stringify(codingDims));
    check('LIVE path: non-coding dimensions preserved', overridden.dimensions.some((d) => d.label === 'Technical' && d.value === 80), JSON.stringify(overridden.dimensions));
    check('LIVE path: codingInterview report attached', overridden.codingInterview === ci, String(overridden.codingInterview === ci));
  } finally {
    await close(server);
    await new Promise((r) => setTimeout(r, 400));
    restore(SESSIONS_FILE, sessBackup);
    restore(QUESTIONS_FILE, qBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Phase 5 metrics smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Metrics smoke test crashed:', err);
    process.exit(2);
  });
