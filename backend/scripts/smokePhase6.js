/**
 * Phase 6 smoke test — realtime voice interview layer.
 *
 * End-to-end and fully OFFLINE/DETERMINISTIC. Boots the real Express app
 * in-process and drives the real REST voice routes (`/api/voice/*`), the real
 * interview engine, and the real feedback finalizer. The AI gateway is
 * replaced by a scripted fake (canned, deterministic completions) to exercise
 * the LIVE engine path, and toggled off to exercise the real MOCK/derived
 * path — no microphone, no browser speech APIs, no external network.
 *
 * Covers (Phase 6):
 *   1.  voice session creation fields (voiceEnabled/voiceMode/stt/tts)
 *   2.  voice metadata persistence across reload
 *   3.  interview transcript (question, answer, follow-up, answer)
 *   4.  semantic duplicate prevention (reworded repeat)
 *   5.  exact duplicate prevention
 *   6.  questions_already_asked context grounding
 *   7.  mock-mode question cycling (never repeats the static pool)
 *   8.  follow-up behavior on weak/incomplete answers (teaching turns)
 *   9.  voice metrics persistence (attached + survive reload)
 *  10.  feedback voice truth block when metrics exist
 *  11.  AI unavailable / derived path (provenance stays truthful)
 *  12.  empty/unavailable voice metrics are never invented
 *  13.  transcript remains authoritative (no duplication/replacement)
 *  14.  session completion (status/score/feedback persisted)
 *
 * Security / truthfulness:
 *   - client cannot claim AI provenance (server sets feedbackSource)
 *   - client cannot fabricate voice metrics (clamped, validated)
 *   - missing voice evidence degrades to unavailable/derived
 *   - no raw audio is ever persisted
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokePhase6.js
 *
 * Backs up backend/data/sessions.json and restores on exit.
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
Backend Engineer - WidgetCo - 2019 - Present
- Built a real-time analytics pipeline used by 2M users

EDUCATION
BSc Computer Science, UT Austin`;

const JD_TEXT = `Software Engineer at WidgetCo
Required: TypeScript, React, Node.js, PostgreSQL, Python
Preferred: Go, AWS, Redis
Responsibilities:
- Build and scale customer-facing web applications
- Design REST APIs and data models`;

// ──────────────────────────────────────────────────────────────
// Scripted AI gateway (live-path injection). `sendGatewayMessage` is read at
// call time by the compiled engine, so patching the module object works.
// When `fakeActive` is false the real provider router runs (offline → mock).
// ──────────────────────────────────────────────────────────────

// The engine imports the gateway facade (`aiGateway`), whose compiled
// `dist/services/aiGateway.js` re-exports provider functions through getters.
// Getter-only accessors are not writable, so the stub is installed on the
// underlying `providerRouter` module instead — the facade's getters resolve
// lazily at call time, so the stub still intercepts every gateway call.
const providerRouter = require('../dist/services/providerRouter.js');
const realCreateGatewaySession = providerRouter.createGatewaySession;
const realSendGatewayMessage = providerRouter.sendGatewayMessage;

let fakeActive = false;
let fakeScript = [];
let promptLog = [];

function setFake(active, script) {
  fakeActive = active;
  fakeScript = script || [];
  promptLog = [];
}

const FEEDBACK_PROMPT_MARK = 'HR evaluator';
const FEEDBACK_REPORT = {
  summary: 'Voice session report. Communication was structured and answers were concise.',
  score: 72,
  dimensions: [
    { label: 'Technical', value: 70 },
    { label: 'Communication', value: 75 },
  ],
  breakdown: [],
  strengths: ['Grounded strength from the session.'],
  gaps: [],
  tips: ['Keep naming trade-offs.'],
  nextTopics: ['System design at scale'],
  strongAnswers: ['First structured answer'],
  weakAnswers: [],
  recommendedCodingPractice: [],
  recommendedInterviewQuestions: [],
};

providerRouter.createGatewaySession = async function createGatewaySessionStub(title) {
  if (!fakeActive) return realCreateGatewaySession.call(this, title);
  return { gatewaySessionId: 'phase6:fake', provider: 'phase6-fake', fromMock: false };
};

providerRouter.sendGatewayMessage = async function sendGatewayMessageStub(gatewaySessionId, content) {
  if (!fakeActive) return realSendGatewayMessage.call(this, gatewaySessionId, content);
  promptLog.push(content);
  if (content.includes(FEEDBACK_PROMPT_MARK)) {
    return { text: JSON.stringify(FEEDBACK_REPORT), provider: 'phase6-fake', model: 'fake-model', latencyMs: 1, fromMock: false };
  }
  const next = fakeScript.shift();
  if (!next) {
    return { text: JSON.stringify({ sender: 'interviewer', text: 'Tell me more about that.' }), provider: 'phase6-fake', model: 'fake-model', latencyMs: 1, fromMock: false };
  }
  return { text: JSON.stringify(next), provider: 'phase6-fake', model: 'fake-model', latencyMs: 1, fromMock: false };
};

const { isSemanticDuplicate, normalizeQuestion } = require('../dist/services/questionDedup.js');

function pairwiseDistinct(arr) {
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      if (normalizeQuestion(arr[i]) === normalizeQuestion(arr[j]) || isSemanticDuplicate(arr[i], arr[j])) return false;
    }
  }
  return true;
}

// ──────────────────────────────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────────────────────────────

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

let base = '';
async function getJson(url) {
  const res = await fetch(`${base}${url}`);
  return { status: res.status, body: await res.json() };
}
async function postJson(url, body) {
  const res = await fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}

// ──────────────────────────────────────────────────────────────
// Test plan
// ──────────────────────────────────────────────────────────────

async function livePathEngineTest() {
  const engine = require('../dist/services/interviewEngine.js');

  // Part A — LIVE path (fake gateway): dedup + follow-ups + transcript.
  setFake(true, [
    { summary: 's', strengths: ['a'], focusAreas: ['b'], question: 'Explain your project architecture.' },
    { sender: 'teaching', text: 'An architecture is the set of key decisions that shape the system. Tip: always name the trade-offs you made.' },
    { sender: 'interviewer', text: 'Can you walk me through the architecture of your project?' },
    { sender: 'interviewer', text: 'Explain your project architecture.' },
    { sender: 'interviewer', text: 'How do you handle database migrations in production?' },
  ]);

  const state = await engine.createInterviewState({
    sessionId: 'phase6-live-engine',
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'WidgetCo',
    resumeText: RESUME_TEXT,
    maxTurns: 20,
  });
  check('Engine live: gateway session is live (not mock)', state.gateway.fromMock === false, String(state.gateway.fromMock));

  const start = await engine.startInterview(state);
  check('Engine live: opening question returned', start.question === 'Explain your project architecture.', start.question);
  const q1 = start.question;
  check('Engine live: opening question persisted to transcript', state.transcript[state.transcript.length - 1].sender === 'interviewer' && state.transcript[state.transcript.length - 1].text === q1, JSON.stringify(state.transcript[state.transcript.length - 1]));

  const a1 = await engine.handleInterviewAnswer(state, 'I built a dashboard with a frontend, backend, and database.');
  check('Weak answer -> teaching follow-up turn', a1.sender === 'teaching', a1.sender);
  check('Teaching turn grounded in concept', a1.text.includes('trade-offs'), JSON.stringify(a1.text));

  const a2 = await engine.handleInterviewAnswer(state, 'It is a client-server app.');
  check('Semantic duplicate question rejected', a2.text !== 'Can you walk me through the architecture of your project?', JSON.stringify(a2.text));
  check('Replacement is a deeper follow-up', a2.text.includes('go one level deeper'), JSON.stringify(a2.text));
  check('Replacement is not a duplicate of Q1', !isSemanticDuplicate(a2.text, q1));
  check('questions_already_asked grounded in prompt', promptLog.some((p) => p.includes('<questions_already_asked>') && p.includes(q1)));

  const a3 = await engine.handleInterviewAnswer(state, 'We used a client-server model.');
  check('Exact duplicate question rejected', a3.text !== 'Explain your project architecture.', JSON.stringify(a3.text));
  check('Exact-duplicate fallback does not repeat prior fallback', a3.text !== a2.text, JSON.stringify(a3.text));
  check('Fallback remains semantically distinct from Q1', !isSemanticDuplicate(a3.text, q1));

  const a4 = await engine.handleInterviewAnswer(state, 'We ran Postgres and applied migrations with Prisma.');
  check('Fresh question emitted unchanged', a4.text === 'How do you handle database migrations in production?', JSON.stringify(a4.text));

  const asked = state.transcript.filter((m) => m.sender === 'interviewer' || m.sender === 'teaching').map((m) => m.text);
  check('All asked turns pairwise distinct', pairwiseDistinct(asked), JSON.stringify(asked));
  check('Transcript: 1 system + 5 asked + 4 candidate', state.transcript.length === 10, String(state.transcript.length));
  check('Transcript messages carry no audio artifacts', state.transcript.every((m) => !('audio' in m) && !('waveform' in m)));
  check('Engine live: turnCount advanced, not completed', state.turnCount === 4 && state.completed === false, JSON.stringify({ t: state.turnCount, c: state.completed }));
}

async function mockPathEngineTest() {
  const engine = require('../dist/services/interviewEngine.js');

  // Part B — MOCK path (real offline gateway): pool cycling + weak answers.
  setFake(false);

  const state = await engine.createInterviewState({
    sessionId: 'phase6-mock-engine',
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'WidgetCo',
    resumeText: RESUME_TEXT,
    maxTurns: 30,
  });
  check('Engine mock: gateway falls back to mock', state.gateway.fromMock === true, String(state.gateway.fromMock));

  const start = await engine.startInterview(state);
  const turns = [start.question];

  // Weak answers push the mock forward through the static pool without
  // repeats; after the pool is exhausted the engine rotates follow-ups.
  const r1 = await engine.handleInterviewAnswer(state, 'I built a dashboard with React.');
  turns.push(r1.text);
  check('Mock weak answer #1 -> teaching turn', r1.sender === 'teaching', r1.sender);

  const r2 = await engine.handleInterviewAnswer(state, 'I used indexes and a cache to speed things up.');
  turns.push(r2.text);

  const r3 = await engine.handleInterviewAnswer(state, 'We used idempotent keys to dedupe events.');
  turns.push(r3.text);

  const r4 = await engine.handleInterviewAnswer(state, 'Another generic answer.');
  turns.push(r4.text);
  check('Mock pool exhausted -> deeper follow-up', r4.text.includes('level deeper'), JSON.stringify(r4.text));

  const r5 = await engine.handleInterviewAnswer(state, 'Yet another generic answer.');
  turns.push(r5.text);
  check('Mock follow-ups rotate (no exact repeat)', r4.text !== r5.text, JSON.stringify({ r4: r4.text, r5: r5.text }));

  check('Mock mode: no question repeats across the run', pairwiseDistinct(turns), JSON.stringify(turns));
  const firstQuestion = start.question;
  check('Mock mode: static questions never cycled back', turns.slice(1).every((t) => !isSemanticDuplicate(t, firstQuestion)), JSON.stringify(turns));
  check('Mock mode: no interviewer turn equals an exhausted repeat of Q1', !turns.slice(1).some((t) => normalizeQuestion(t) === normalizeQuestion(firstQuestion)));
}

async function liveRESTTest(app) {
  const sessionsModule = require('../dist/routes/sessions.js');

  // Part C1 — REST live path (fake gateway): creation, persistence,
  // config/state validation, clamping, audio non-persistence, dedup,
  // metrics, feedback truth block, completion.
  setFake(true, [
    { sender: 'interviewer', text: 'Explain your project architecture.' },
    { sender: 'interviewer', text: 'Can you walk me through the architecture of your project?' },
    { sender: 'interviewer', text: 'Explain your project architecture.' },
    { sender: 'interviewer', text: 'How do you handle database migrations in production?' },
  ]);

  const created = await postJson('/api/sessions', {
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'WidgetCo',
    resumeText: RESUME_TEXT,
    jdText: JD_TEXT,
    voiceMode: 'voice',
    voiceEnabled: true,
    sttSupported: true,
    ttsSupported: true,
  });
  const id = created.body.data && created.body.data.id;
  check('POST /api/sessions with voice fields -> 201', created.status === 201 && !!id, String(created.status));
  check('voice.enabled persisted on creation', created.body.data.voice.enabled === true, JSON.stringify(created.body.data.voice));
  check('voice.mode persisted on creation', created.body.data.voice.mode === 'voice');
  check('sttSupported/ttsSupported persisted', created.body.data.voice.sttSupported === true && created.body.data.voice.ttsSupported === true);
  check('startedAt set when voice enabled', typeof created.body.data.voice.startedAt === 'string', String(created.body.data.voice.startedAt));

  const badMode = await postJson('/api/sessions', { mode: 'TECHNICAL', voiceMode: 'telepathic' });
  check('Invalid voiceMode on create -> 400', badMode.status === 400, String(badMode.status));
  const badEnabled = await postJson('/api/sessions', { mode: 'TECHNICAL', voiceEnabled: 'yes' });
  check('Invalid voiceEnabled on create -> 400', badEnabled.status === 400, String(badEnabled.status));

  const reloaded = await getJson(`/api/sessions/${id}`);
  check('Voice metadata survives reload', reloaded.body.data.voice.enabled === true && reloaded.body.data.voice.mode === 'voice' && reloaded.body.data.voice.sttSupported === true, JSON.stringify(reloaded.body.data.voice));

  const cfg1 = await postJson(`/api/voice/${id}/config`, { mode: 'text' });
  check('Config -> text mode accepted', cfg1.status === 200 && cfg1.body.data.voice.mode === 'text', String(cfg1.status));
  const cfg2 = await postJson(`/api/voice/${id}/config`, { mode: 'voice' });
  check('Config -> voice mode accepted', cfg2.body.data.voice.mode === 'voice');
  const cfg3 = await postJson(`/api/voice/${id}/config`, { mode: 'telepathic' });
  check('Config invalid mode -> 400', cfg3.status === 400, String(cfg3.status));
  const cfg4 = await postJson(`/api/voice/${id}/config`, { sttSupported: 'yes' });
  check('Config invalid sttSupported -> 400', cfg4.status === 400, String(cfg4.status));
  const cfg5 = await postJson(`/api/voice/${id}/config`, { enabled: false });
  check('Config -> disabled accepted', cfg5.status === 200 && cfg5.body.data.voice.enabled === false, String(cfg5.status));
  await postJson(`/api/voice/${id}/config`, { mode: 'voice', enabled: true });

  // Voice state machine — server-authoritative (transition graph + 400/409).
  const st0 = await postJson(`/api/voice/${id}/state`, { from: 'AI_SPEAKING', to: 'BOGUS' });
  check('Invalid state value rejected (400)', st0.status === 400, String(st0.status));
  const st1 = await postJson(`/api/voice/${id}/state`, { from: 'AI_SPEAKING', to: 'PROCESSING_ANSWER' });
  check('Valid state transition accepted', st1.status === 200 && st1.body.data.voice.state === 'PROCESSING_ANSWER', String(st1.status));
  const stBad = await postJson(`/api/voice/${id}/state`, { from: 'PROCESSING_ANSWER', to: 'AI_SPEAKING' });
  check('Invalid transition rejected (409)', stBad.status === 409, String(stBad.status));
  const st3 = await postJson(`/api/voice/${id}/state`, { from: 'AI_SPEAKING', to: 'LISTENING', interruption: true });
  check('Interruption transition accepted + counted', st3.status === 200 && st3.body.data.voice.interruptions === 1, JSON.stringify(st3.body.data.voice));
  const int1 = await postJson(`/api/voice/${id}/interruption`, {});
  check('Interruption endpoint increments counter', int1.body.data.voice.interruptions === 2, String(int1.body.data.voice.interruptions));
  const st4 = await postJson(`/api/voice/${id}/state`, { from: 'LISTENING', to: 'LISTENING' });
  check('Idempotent same-state allowed', st4.status === 200, String(st4.status));

  // Answers with durations (voice mode). 9e9 ms must be clamped to 10 min.
  const a1 = await postJson(`/api/voice/${id}/answer`, { text: 'I built a full-stack application.', answerDurationMs: 25000, mode: 'voice' });
  check('Answer 1 -> interviewer question', a1.status === 200 && a1.body.data.answer.sender === 'interviewer' && a1.body.data.answer.text === 'Explain your project architecture.', JSON.stringify(a1.body.data.answer));
  check('Answer 1 voice timing accumulated', a1.body.data.voice.speechTurns === 1 && a1.body.data.voice.totalAnswerDurationMs === 25000, JSON.stringify(a1.body.data.voice));

  const a2 = await postJson(`/api/voice/${id}/answer`, { text: 'It uses React, Express, and Postgres.', answerDurationMs: 9e9, mode: 'voice' });
  check('Huge answer duration clamped to 10 minutes', a2.body.data.voice.totalAnswerDurationMs === 25000 + 600000, String(a2.body.data.voice.totalAnswerDurationMs));
  check('Semantic duplicate question replaced (REST)', a2.body.data.answer.text !== 'Can you walk me through the architecture of your project?' && a2.body.data.answer.text.includes('go one level deeper'), JSON.stringify(a2.body.data.answer.text));

  const a3 = await postJson(`/api/voice/${id}/answer`, { text: 'We used a client-server model.', answerDurationMs: 30000, mode: 'voice' });
  check('Exact duplicate question rejected (REST)', a3.body.data.answer.text !== 'Explain your project architecture.', JSON.stringify(a3.body.data.answer.text));
  check('Fallback rotates between duplicate rejections', a3.body.data.answer.text !== a2.body.data.answer.text, JSON.stringify(a3.body.data.answer.text));

  const a4 = await postJson(`/api/voice/${id}/answer`, { text: 'We ran migrations with Prisma.', answerDurationMs: 15000, mode: 'voice', audio: 'BASE64WAVDUMMY' });
  check('Fresh question emitted unchanged (REST)', a4.status === 200 && a4.body.data.answer.text === 'How do you handle database migrations in production?', JSON.stringify(a4.body.data.answer.text));

  const aNeg = await postJson(`/api/voice/${id}/answer`, { text: 'negative', answerDurationMs: -5, mode: 'voice' });
  check('Negative answer duration rejected (400)', aNeg.status === 400, String(aNeg.status));
  const aNaN = await postJson(`/api/voice/${id}/answer`, { text: 'nan', answerDurationMs: 'not-a-number', mode: 'voice' });
  check('Non-numeric answer duration rejected (400)', aNaN.status === 400, String(aNaN.status));
  const aNoText = await postJson(`/api/voice/${id}/answer`, { answerDurationMs: 100 });
  check('Missing answer text rejected (400)', aNoText.status === 400, String(aNoText.status));

  const midSession = await getJson(`/api/sessions/${id}`);
  check('No raw audio persisted in session', !JSON.stringify(midSession.body.data).includes('BASE64WAVDUMMY') && !JSON.stringify(midSession.body.data).includes('"audio"'), 'audio found in session record');
  check('Transcript messages carry no audio field', midSession.body.data.transcript.every((m) => !('audio' in m)));

  const status1 = await getJson(`/api/voice/${id}/status`);
  const m = status1.body.data.metrics;
  check('Voice status exposes transcript', Array.isArray(status1.body.data.transcript) && status1.body.data.transcript.length === 8, String(status1.body.data.transcript && status1.body.data.transcript.length));
  check('metrics.totalVoiceQuestions = 4', m.totalVoiceQuestions === 4, String(m.totalVoiceQuestions));
  check('metrics.answeredQuestions = 4', m.answeredQuestions === 4, String(m.answeredQuestions));
  check('metrics.speechTurnCount = 4', m.speechTurnCount === 4, String(m.speechTurnCount));
  check('metrics.averageAnswerDurationMs = 167500', m.averageAnswerDurationMs === 167500, String(m.averageAnswerDurationMs));
  check('metrics.available.durations true', m.available.durations === true, JSON.stringify(m.available));
  check('metrics.available.interruptions true', m.available.interruptions === true, JSON.stringify(m.available));
  check('questions_already_asked grounded at REST layer', promptLog.some((p) => p.includes('<questions_already_asked>') && p.includes('Explain your project architecture.')));

  // Finalize via the live (fake) gateway — client tries to claim AI provenance.
  const end = await postJson(`/api/voice/${id}/end`, { feedbackSource: 'ai' });
  const rep = end.body.data && end.body.data.report;
  check('End -> report generated', end.status === 200 && !!rep, String(end.status) + ' ' + JSON.stringify(end.body.error || ''));
  check('LIVE path feedbackSource = ai (server truth)', rep.feedbackSource === 'ai', String(rep.feedbackSource));
  check('Report provider from server gateway', rep.provider === 'phase6-fake' && rep.gateway === 'phase6-fake', JSON.stringify({ p: rep.provider, g: rep.gateway }));
  check('Voice truth block attached to AI report', rep.voice && rep.voice.voiceEnabled === true && rep.voice.speechTurnCount === 4, JSON.stringify(rep.voice));
  check('Voice total speaking time grounded', rep.voice.totalSpeakingTimeMs === 670000, String(rep.voice.totalSpeakingTimeMs));
  check('Voice average duration grounded', rep.voice.averageAnswerDurationMs === 167500, String(rep.voice.averageAnswerDurationMs));
  check('Voice interruption count grounded', rep.voice.interruptionCount === 2, String(rep.voice.interruptionCount));
  check('Voice session duration derived after end', rep.voice.available.sessionDuration === true && typeof rep.voice.voiceSessionDurationMs === 'number' && rep.voice.voiceSessionDurationMs >= 0, String(rep.voice.voiceSessionDurationMs));
  check('Report score from server', rep.score === 72, String(rep.score));

  const s1Final = await getJson(`/api/sessions/${id}`);
  check('Session COMPLETED after end', s1Final.body.data.status === 'COMPLETED', s1Final.body.data.status);
  check('Session score persisted', s1Final.body.data.score === 72, String(s1Final.body.data.score));
  check('Session feedback carries voice metrics', s1Final.body.data.feedback && s1Final.body.data.feedback.voice && s1Final.body.data.feedback.voice.speechTurnCount === 4, JSON.stringify(s1Final.body.data.feedback && s1Final.body.data.feedback.voice));
  check('Transcript remains authoritative (8 messages)', Array.isArray(s1Final.body.data.transcript) && s1Final.body.data.transcript.length === 8, String(s1Final.body.data.transcript.length));
  check('Voice metadata does not duplicate transcript', !('transcript' in s1Final.body.data.voice), JSON.stringify(Object.keys(s1Final.body.data.voice)));
}

async function derivedPathRESTTest() {
  // Part C2 — MOCK / derived path: no AI provider reachable.
  setFake(false);

  const created = await postJson('/api/sessions', {
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'WidgetCo',
    resumeText: RESUME_TEXT,
    voiceMode: 'voice',
    voiceEnabled: true,
    sttSupported: false,
    ttsSupported: true,
  });
  const id = created.body.data && created.body.data.id;
  check('Derived-path session created (201)', created.status === 201 && !!id, String(created.status));
  check('sttSupported false persisted', created.body.data.voice.sttSupported === false, JSON.stringify(created.body.data.voice));

  const a1 = await postJson(`/api/voice/${id}/answer`, { text: 'I built a real-time analytics pipeline.', answerDurationMs: 40000, mode: 'voice' });
  check('Mock answer 1 -> Q0 open question accepted', a1.status === 200 && a1.body.data.answer.sender === 'interviewer' && a1.body.data.answer.text.includes('Solid answer'), JSON.stringify(a1.body.data.answer));
  const a2 = await postJson(`/api/voice/${id}/answer`, { text: 'We used Kafka and ClickHouse.', answerDurationMs: 60000, mode: 'voice' });
  check('Mock answer 2 -> teaching (weak evidence)', a2.status === 200 && a2.body.data.answer.sender === 'teaching', a2.body.data.answer.sender);

  const status1 = await getJson(`/api/voice/${id}/status`);
  check('Derived path gateway flagged fromMock', status1.body.data.gateway && status1.body.data.gateway.fromMock === true, JSON.stringify(status1.body.data.gateway));
  const m = status1.body.data.metrics;
  check('Derived metrics speech turns = 2', m.speechTurnCount === 2, String(m.speechTurnCount));
  check('Derived metrics duration totals = 100s', m.totalSpeakingTimeMs === 100000, String(m.totalSpeakingTimeMs));

  // Client tries to claim AI provenance on a provider-down session.
  const end = await postJson(`/api/voice/${id}/end`, { feedbackSource: 'ai' });
  const rep = end.body.data && end.body.data.report;
  check('Derived feedback returned', end.status === 200 && !!rep, String(end.status) + ' ' + JSON.stringify(end.body.error || ''));
  check('Provenance truthful: mock (client cannot claim ai)', rep.feedbackSource === 'mock', String(rep.feedbackSource));
  check('No fake AI provenance fields', rep.provider === null && rep.gateway === null && rep.model === null, JSON.stringify({ p: rep.provider, g: rep.gateway, m: rep.model }));
  check('Voice metrics survive into derived report', rep.voice && rep.voice.voiceEnabled === true && rep.voice.speechTurnCount === 2, JSON.stringify(rep.voice));
  check('Derived duration totals correct', rep.voice.totalSpeakingTimeMs === 100000 && rep.voice.averageAnswerDurationMs === 50000, JSON.stringify({ t: rep.voice && rep.voice.totalSpeakingTimeMs, a: rep.voice && rep.voice.averageAnswerDurationMs }));
  check('Interruptions not fabricated', rep.voice.interruptionCount === 0 && rep.voice.available.interruptions === false, JSON.stringify(rep.voice && rep.voice.available));

  const sFinal = await getJson(`/api/sessions/${id}`);
  check('Derived session COMPLETED', sFinal.body.data.status === 'COMPLETED', sFinal.body.data.status);
  check('Derived session score persisted', typeof sFinal.body.data.score === 'number' && sFinal.body.data.score > 0, String(sFinal.body.data.score));
  check('Derived feedback source persisted truthfully', sFinal.body.data.feedback.feedbackSource === 'mock', sFinal.body.data.feedback.feedbackSource);
  check('Voice metrics survive reload', sFinal.body.data.feedback.voice.speechTurnCount === 2 && sFinal.body.data.feedback.voice.voiceEnabled === true, JSON.stringify(sFinal.body.data.feedback.voice));
}

async function emptyVoiceRESTTest() {
  // Part C3 — no voice config at all: nothing may be invented.
  setFake(false);

  const created = await postJson('/api/sessions', {
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'WidgetCo',
    resumeText: RESUME_TEXT,
  });
  const id = created.body.data && created.body.data.id;
  check('No-voice session created (201)', created.status === 201 && !!id, String(created.status));
  check('Default voice meta disabled/text', created.body.data.voice.enabled === false && created.body.data.voice.mode === 'text', JSON.stringify(created.body.data.voice));

  await postJson(`/api/voice/${id}/answer`, { text: 'Text answer without voice mode.' });
  await postJson(`/api/voice/${id}/answer`, { text: 'Another text answer.' });

  const end = await postJson(`/api/voice/${id}/end`, {});
  const v = end.body.data && end.body.data.report && end.body.data.report.voice;
  check('Empty voice -> report.voice defaults disabled', v && v.voiceEnabled === false && v.voiceMode === 'text', JSON.stringify(v));
  check('No invented average answer duration', v.averageAnswerDurationMs === null, String(v.averageAnswerDurationMs));
  check('No invented speaking time', v.totalSpeakingTimeMs === 0, String(v.totalSpeakingTimeMs));
  check('No invented interruptions', v.interruptionCount === 0 && v.available.interruptions === false, JSON.stringify(v.available));
  check('No invented speech turns', v.speechTurnCount === 0 && v.available.speechTurns === false, JSON.stringify(v.available));
  check('No invented session duration', v.voiceSessionDurationMs === null && v.available.sessionDuration === false, JSON.stringify(v.available));
  const inventedKeys = ['confidence', 'sttConfidence', 'personality', 'emotion', 'honesty', 'clarity', 'transcript', 'audio', 'waveform'];
  check('No fabricated metric keys invented', inventedKeys.every((k) => !(k in v)), JSON.stringify(Object.keys(v)));

  const sFinal = await getJson(`/api/sessions/${id}`);
  check('Empty-voice session COMPLETED', sFinal.body.data.status === 'COMPLETED', sFinal.body.data.status);
  check('Empty-voice transcript authoritative (2 questions)', Array.isArray(sFinal.body.data.transcript) && sFinal.body.data.transcript.length === 4, String(sFinal.body.data.transcript.length));
  check('Empty-voice report keeps transcript intact', !('audio' in sFinal.body.data.transcript[0]));
}

async function main() {
  const sessBackup = backup(SESSIONS_FILE);

  const app = require('../dist/app.js').default;
  const sessionsModule = require('../dist/routes/sessions.js');

  console.log('\n[Phase 6] Realtime voice interview');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  base = `http://127.0.0.1:${port}`;

  try {
    await livePathEngineTest();
    await mockPathEngineTest();
    await liveRESTTest();
    await derivedPathRESTTest();
    await emptyVoiceRESTTest();
  } finally {
    await close(server);
    await new Promise((r) => setTimeout(r, 400));
    restore(SESSIONS_FILE, sessBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Phase 6 smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Smoke test crashed:', err);
    process.exit(2);
  });
