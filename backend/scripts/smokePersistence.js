/**
 * Database persistence round-trip smoke test — userId ownership + voice
 * metadata. Fully OFFLINE and deterministic (no real DB required).
 *
 * Section 1 exercises the exact store mapping functions that load/save against
 * the database-backed stores:
 *   - supabaseStore.toRow/fromRow
 *   - postgresStore.toRow/fromRow (positional params must stay aligned)
 *   - legacy rows without user_id/voice must stay compatible (NULL passthrough)
 *
 * Section 2 boots the real Express app with the real JWT auth layer active,
 * creates a voice session, flushes persistence, then simulates a server
 * restart (fresh module instance + store reload) to prove the authorization
 * boundary AND the voice metadata survive a reload, while legacy NULL-userId
 * sessions remain readable by any authenticated user.
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokePersistence.js
 *
 * Backs up backend/data/sessions.json and restores it on exit.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'smoke-persistence-jwt-secret-0123456789';
process.env.JWT_SECRET = TEST_SECRET; // dotenv will NOT overwrite existing keys
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.DATABASE_URL = '';
delete process.env.AUTH_TEST_MODE; // real auth path — never bypassed here

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

// ──────────────────────────────────────────────────────────────
// Helpers
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
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function mintToken(userId, email, name) {
  return jwt.sign({ userId, email, name }, TEST_SECRET, { expiresIn: '1h' });
}

let base = '';
async function req(method, url, token, body) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

// Voice metadata shaped like createDefaultVoiceMeta() + interview metrics
// (the real object the app persists on the session record).
const VOICE = {
  mode: 'voice',
  enabled: true,
  sttSupported: true,
  ttsSupported: true,
  state: 'AI_SPEAKING',
  startedAt: '2026-08-11T00:00:00.000Z',
  speechTurns: 3,
  answerCount: 3,
  interruptions: 1,
  totalAnswerDurationMs: 45000,
};

// Representative minimal session record (all optional fields exercise the
// `?? null` fallbacks in the store mappings).
function sampleRecord(overrides) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    userId: 'user-a',
    mode: 'TECHNICAL',
    role: 'Engineer',
    company: 'Acme',
    candidateId: 'c1',
    resumeText: '',
    jdText: '',
    githubSummary: '',
    difficulty: 'Medium',
    skills: ['React'],
    resumeProfile: '',
    jdProfile: '',
    resumeProfileData: null,
    jdProfileData: null,
    matchReport: null,
    coding: null,
    codingInterview: null,
    resumeFileKey: null,
    resumeFileUrl: null,
    resumeFileName: null,
    status: 'ACTIVE',
    createdAt: '2026-08-11T00:00:00.000Z',
    startedAt: null,
    score: null,
    durationMs: null,
    feedback: null,
    roadmap: null,
    transcript: [],
    projectProfileData: null,
    projectIndex: null,
    githubAnalysis: '',
    githubAnalyzedAt: null,
    voice: VOICE,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// Section 1 — DB-backed store mapping round-trips
// ──────────────────────────────────────────────────────────────

function runStoreMappingTests() {
  console.log('\n[Section 1] DB-backed store mappings (user_id + voice)');

  const supabase = require('../dist/services/stores/supabaseStore.js');
  const postgres = require('../dist/services/stores/postgresStore.js');

  // ── Supabase (object row — full round-trip) ──
  const rec = sampleRecord();
  const sRow = supabase.toRow(rec);
  check('supabase toRow maps userId -> user_id', sRow.user_id === 'user-a', JSON.stringify(sRow.user_id));
  check('supabase toRow maps voice object', deepEqual(sRow.voice, VOICE), JSON.stringify(sRow.voice));
  const sRound = supabase.fromRow(sRow);
  check('supabase fromRow maps user_id -> userId', sRound.userId === 'user-a', JSON.stringify(sRound.userId));
  check('supabase fromRow restores voice object', deepEqual(sRound.voice, VOICE), JSON.stringify(sRound.voice));
  check('supabase round-trip preserves other fields', sRound.id === rec.id && sRound.status === rec.status && deepEqual(sRound.transcript, []), JSON.stringify(sRound.id));

  // Legacy / empty values -> NULL both ways
  const sLegacyRow = supabase.toRow(sampleRecord({ userId: null, voice: null }));
  check('supabase toRow null userId -> user_id NULL', sLegacyRow.user_id === null, JSON.stringify(sLegacyRow.user_id));
  check('supabase toRow null voice -> voice NULL', sLegacyRow.voice === null, JSON.stringify(sLegacyRow.voice));
  const sMissing = supabase.fromRow({ id: 'x', mode: 'CODING' });
  check('supabase fromRow missing columns -> userId null', sMissing.userId === null, JSON.stringify(sMissing.userId));
  check('supabase fromRow missing columns -> voice null', sMissing.voice === null, JSON.stringify(sMissing.voice));

  // ── Postgres (positional array — must stay aligned with UPSERT_SQL) ──
  const pRow = postgres.toRow(rec);
  check('postgres toRow emits exactly 34 params', pRow.length === 34, `len=${pRow.length}`);
  check('postgres param #33 is userId (user_id)', pRow[32] === 'user-a', JSON.stringify(pRow[32]));
  check('postgres param #34 is voice', deepEqual(pRow[33], VOICE), JSON.stringify(pRow[33]));
  check('postgres earlier params untouched (id, mode)', pRow[0] === rec.id && pRow[1] === 'TECHNICAL', JSON.stringify([pRow[0], pRow[1]]));
  const pRound = postgres.fromRow({ id: rec.id, mode: 'TECHNICAL', status: 'ACTIVE', created_at: '2026-08-11T00:00:00.000Z', transcript: [], user_id: 'user-a', voice: VOICE });
  check('postgres fromRow maps user_id -> userId', pRound.userId === 'user-a', JSON.stringify(pRound.userId));
  check('postgres fromRow restores voice object', deepEqual(pRound.voice, VOICE), JSON.stringify(pRound.voice));
  const pMissing = postgres.fromRow({ id: 'x', mode: 'CODING', status: 'SETUP', created_at: '2026-08-11T00:00:00.000Z' });
  check('postgres fromRow missing columns -> userId null', pMissing.userId === null, JSON.stringify(pMissing.userId));
  check('postgres fromRow missing columns -> voice null', pMissing.voice === null, JSON.stringify(pMissing.voice));

  // Guard the compiled UPSERT_SQL text: columns and params must match toRow order.
  const pgSrc = fs.readFileSync(path.resolve(__dirname, '../dist/services/stores/postgresStore.js'), 'utf-8');
  check('postgres UPSERT lists user_id + voice columns', pgSrc.includes('user_id, voice'), '');
  check('postgres UPSERT uses $33/$34 for the appended params', pgSrc.includes('$33, $34'), '');
  check('postgres UPSERT conflict-update writes user_id + voice', pgSrc.includes('user_id = excluded.user_id') && pgSrc.includes('voice = excluded.voice'), '');
  const sbSrc = fs.readFileSync(path.resolve(__dirname, '../dist/services/stores/supabaseStore.js'), 'utf-8');
  check('supabase upsert lists user_id + voice', sbSrc.includes('user_id:') && sbSrc.includes('voice:'), '');
  check('supabase persist upserts on id conflict', sbSrc.includes('.upsert(') && sbSrc.includes("onConflict: 'id'"), '');

  // ── Production schema sync: the DB must carry user_id + voice. The code is
  //    already writing these columns, so a missing one fails every upsert with
  //    PGRST204. The migration must be additive + idempotent. ──
  console.log('\n[Section 1b] Production schema migration (user_id + voice)');
  const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf-8');
  const migration = fs.readFileSync(path.resolve(__dirname, '../db/migrations/0001_add_user_id_and_voice.sql'), 'utf-8');
  check('schema.sql adds voice column additively', schema.includes('add column if not exists voice jsonb'), '');
  check('schema.sql adds user_id column additively', schema.includes('add column if not exists user_id uuid'), '');
  check('migration file adds voice column additively', /add column if not exists voice\s+jsonb/i.test(migration), '');
  check('migration file adds user_id column additively', /add column if not exists user_id\s+uuid/i.test(migration), '');
  const migLower = migration.toLowerCase();
  check('migration never drops/truncates sessions', !migLower.includes('drop table') && !migLower.includes('truncate'), '');
  check('migration is idempotent (IF NOT EXISTS both columns)', (migration.match(/add column if not exists/g) || []).length === 2, '');
}

// ──────────────────────────────────────────────────────────────
// Section 2 — end-to-end restart/reload (real app, real JWT auth)
// ──────────────────────────────────────────────────────────────

async function runAppReloadTests() {
  console.log('\n[Section 2] End-to-end reload: ownership + voice survive restart');

  const TOKEN_A = mintToken('user-a', 'alice@example.com', 'Alice');
  const TOKEN_B = mintToken('user-b', 'bob@example.com', 'Bob');

  let app = require('../dist/app.js').default;
  let sessionsModule = require('../dist/routes/sessions.js');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  base = `http://127.0.0.1:${port}`;

  // Create a voice session as user A.
  const created = await req('POST', '/api/sessions', TOKEN_A, {
    mode: 'CODING',
    difficulty: 'Medium',
    voiceMode: 'voice',
    voiceEnabled: true,
  });
  check('POST /api/sessions with voice config -> 201', created.status === 201, String(created.status));
  const sessionAId = created.body && created.body.data ? created.body.data.id : null;
  check('Voice session stamped userId=user-a', created.body && created.body.data && created.body.data.userId === 'user-a', JSON.stringify(created.body && created.body.data));
  check('Voice config persisted on create (enabled + mode)', created.body && created.body.data && created.body.data.voice && created.body.data.voice.enabled === true && created.body.data.voice.mode === 'voice', JSON.stringify(created.body && created.body.data && created.body.data.voice));
  check('Voice session has an id', !!sessionAId, String(sessionAId));

  // Flush debounced persistence so the file is durable before "restart".
  await new Promise((r) => setTimeout(r, 500));
  await sessionsModule.flushSessionStore();

  // Verify the on-disk record carried both fields.
  const onDisk = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  const diskRec = onDisk.find((s) => s.id === sessionAId);
  check('Persisted file record has userId', diskRec && diskRec.userId === 'user-a', JSON.stringify(diskRec && diskRec.userId));
  check('Persisted file record has voice enabled', diskRec && diskRec.voice && diskRec.voice.enabled === true && diskRec.voice.mode === 'voice', JSON.stringify(diskRec && diskRec.voice));

  await close(server);
  await new Promise((r) => setTimeout(r, 300));

  // ── Simulate a server restart: fresh module instance + store reload ──
  for (const key of Object.keys(require.cache)) {
    if (key.includes(path.sep + 'dist' + path.sep)) delete require.cache[key];
  }
  app = require('../dist/app.js').default;
  sessionsModule = require('../dist/routes/sessions.js');
  await sessionsModule.initSessionStore();
  const { server: server2, port: port2 } = await listen(app);
  base = `http://127.0.0.1:${port2}`;

  try {
    // Ownership boundary survives reload.
    const ownerRead = await req('GET', `/api/sessions/${sessionAId}`, TOKEN_A);
    check('Owner reads own session after restart -> 200', ownerRead.status === 200, String(ownerRead.status));
    check('Reloaded session keeps userId=user-a', ownerRead.body && ownerRead.body.data && ownerRead.body.data.userId === 'user-a', JSON.stringify(ownerRead.body && ownerRead.body.data && ownerRead.body.data.userId));
    check('Reloaded session keeps voice config', ownerRead.body && ownerRead.body.data && ownerRead.body.data.voice && ownerRead.body.data.voice.enabled === true && ownerRead.body.data.voice.mode === 'voice', JSON.stringify(ownerRead.body && ownerRead.body.data && ownerRead.body.data.voice));

    const crossB = await req('GET', `/api/sessions/${sessionAId}`, TOKEN_B);
    check('Other user cannot read session after restart -> 404', crossB.status === 404, String(crossB.status));

    const listB = await req('GET', '/api/sessions', TOKEN_B);
    const listBIds = listB.body && Array.isArray(listB.body.data) ? listB.body.data.map((s) => s.id) : [];
    check('Other user list excludes session after restart', !listBIds.includes(sessionAId), listBIds.join(','));

    // Legacy NULL-userId session stays compatible after reload.
    const legacyA = await req('GET', '/api/sessions/legacy-0000-0000-0000-000000000001', TOKEN_A);
    const legacyB = await req('GET', '/api/sessions/legacy-0000-0000-0000-000000000001', TOKEN_B);
    check('Legacy session still readable after restart (back-compat)', legacyA.status === 200 && legacyB.status === 200, `${legacyA.status}/${legacyB.status}`);

    const listA = await req('GET', '/api/sessions', TOKEN_A);
    const listAIds = listA.body && Array.isArray(listA.body.data) ? listA.body.data.map((s) => s.id) : [];
    check('Owner list includes session after restart', listAIds.includes(sessionAId), listAIds.join(','));
  } finally {
    await close(server2);
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  const sessBackup = backup(SESSIONS_FILE);

  // Seed a legacy session (no userId) so back-compat visibility is deterministic.
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(
    SESSIONS_FILE,
    JSON.stringify(
      [
        {
          id: 'legacy-0000-0000-0000-000000000001',
          userId: null,
          mode: 'CODING',
          difficulty: 'Medium',
          status: 'SETUP',
          createdAt: new Date().toISOString(),
          transcript: [],
          voice: { enabled: false, mode: 'text', sttSupported: false, ttsSupported: false },
        },
      ],
      null,
      2,
    ),
    'utf-8',
  );

  try {
    runStoreMappingTests();
    await runAppReloadTests();
  } finally {
    restore(SESSIONS_FILE, sessBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Persistence smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Persistence smoke crashed:', err);
    process.exit(2);
  });
