/**
 * Auth + session-ownership smoke test — fully OFFLINE and deterministic.
 *
 * Boots the real Express app in-process with the REAL JWT auth layer active
 * (no AUTH_TEST_MODE), then verifies:
 *
 *   1. /api/health stays open (no token required)
 *   2. protected routes reject missing tokens with 401
 *   3. protected routes reject garbage/forged tokens with 401
 *   4. valid tokens (signed with the same getJwtSecret()) pass
 *   5. register/login are reachable without a token and fail cleanly offline
 *      (500, never a crash/hang) instead of being gated by auth
 *   6. sessions created by user A are invisible to user B (list + direct read)
 *   7. cross-user PATCH /:id/status and /:id/feedback return 404 (no leak)
 *   8. legacy sessions (no userId) remain readable by any authenticated user
 *   9. GET /api/auth/me reflects the verified token identity
 *  10. a representative voice route also enforces ownership (404 cross-user)
 *
 * The JWT secret is pinned to a known value BEFORE dotenv loads so tokens can
 * be minted with the exact same secret the middleware resolves.
 *
 * Run against compiled dist/ (`npm run build` first):
 *   node scripts/smokeAuth.js
 *
 * Backs up backend/data/sessions.json and restores on exit.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const TEST_SECRET = 'smoke-auth-jwt-secret-0123456789';
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

function mintToken(userId, email, name) {
  return jwt.sign({ userId, email, name }, TEST_SECRET, { expiresIn: '1h' });
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

async function runTests() {
  const TOKEN_A = mintToken('user-a', 'alice@example.com', 'Alice');
  const TOKEN_B = mintToken('user-b', 'bob@example.com', 'Bob');
  const FORGED = jwt.sign({ userId: 'user-a', email: 'alice@example.com', name: 'Alice' }, 'wrong-secret');

  // 1. Open routes stay open
  const health = await req('GET', '/api/health', null);
  check('Health endpoint open without token', health.status === 200, String(health.status));

  const reg = await req('POST', '/api/auth/register', null, {
    email: 'new@example.com',
    password: 'str0ng!Pass',
    name: 'New',
  });
  check('Register reachable without token (open route)', reg.status === 500, String(reg.status));
  check('Register fails cleanly offline (no crash/hang)', reg.body && reg.body.success === false, JSON.stringify(reg.body));

  // 2. Missing / invalid tokens rejected
  const noToken = await req('GET', '/api/sessions', null);
  check('GET /api/sessions without token -> 401', noToken.status === 401, String(noToken.status));

  const garbage = await req('GET', '/api/sessions', 'not.a.jwt');
  check('GET /api/sessions with garbage token -> 401', garbage.status === 401, String(garbage.status));

  const forged = await req('GET', '/api/sessions', FORGED);
  check('GET /api/sessions with forged (wrong-secret) token -> 401', forged.status === 401, String(forged.status));

  const meNoToken = await req('GET', '/api/auth/me', null);
  check('GET /api/auth/me without token -> 401', meNoToken.status === 401, String(meNoToken.status));

  // 3. Valid identity
  const meA = await req('GET', '/api/auth/me', TOKEN_A);
  check('GET /api/auth/me with valid token -> 200', meA.status === 200, String(meA.status));
  check('me reflects token identity', meA.body && meA.body.user && meA.body.user.userId === 'user-a', JSON.stringify(meA.body));

  // 4. Legacy session readable by any authenticated user
  const legacyA = await req('GET', '/api/sessions/legacy-0000-0000-0000-000000000001', TOKEN_A);
  check('Legacy session readable by user A', legacyA.status === 200, String(legacyA.status));
  const legacyB = await req('GET', '/api/sessions/legacy-0000-0000-0000-000000000001', TOKEN_B);
  check('Legacy session readable by user B (back-compat)', legacyB.status === 200, String(legacyB.status));

  // 5. Create + stamp
  const created = await req('POST', '/api/sessions', TOKEN_A, { mode: 'CODING', difficulty: 'Medium' });
  check('POST /api/sessions with valid token -> 201', created.status === 201, String(created.status));
  const sessionAId = created.body && created.body.data ? created.body.data.id : null;
  check('Created session carries owner stamp userId=user-a', created.body && created.body.data && created.body.data.userId === 'user-a', JSON.stringify(created.body));
  check('Created session has an id', !!sessionAId, String(sessionAId));

  // 6. Cross-user isolation
  const listB = await req('GET', '/api/sessions', TOKEN_B);
  const listBIds = listB.body && Array.isArray(listB.body.data) ? listB.body.data.map((s) => s.id) : [];
  check('User B list does not expose user A session', !listBIds.includes(sessionAId), listBIds.join(','));
  check('User B list still includes legacy session', listBIds.includes('legacy-0000-0000-0000-000000000001'), listBIds.join(','));

  const directB = await req('GET', `/api/sessions/${sessionAId}`, TOKEN_B);
  check('User B direct read of A session -> 404', directB.status === 404, String(directB.status));

  const patchB = await req('PATCH', `/api/sessions/${sessionAId}/status`, TOKEN_B, { status: 'ACTIVE' });
  check('User B PATCH of A session status -> 404', patchB.status === 404, String(patchB.status));

  const feedbackB = await req('GET', `/api/sessions/${sessionAId}/feedback`, TOKEN_B);
  check('User B read of A feedback -> 404', feedbackB.status === 404, String(feedbackB.status));

  const voiceB = await req('GET', `/api/voice/${sessionAId}/status`, TOKEN_B);
  check('User B voice status of A session -> 404', voiceB.status === 404, String(voiceB.status));

  // 7. Owner still has full access
  const directA = await req('GET', `/api/sessions/${sessionAId}`, TOKEN_A);
  check('User A direct read of own session -> 200', directA.status === 200, String(directA.status));

  const listA = await req('GET', '/api/sessions', TOKEN_A);
  const listAIds = listA.body && Array.isArray(listA.body.data) ? listA.body.data.map((s) => s.id) : [];
  check('User A list includes own session', listAIds.includes(sessionAId), listAIds.join(','));

  const patchA = await req('PATCH', `/api/sessions/${sessionAId}/status`, TOKEN_A, { status: 'ACTIVE' });
  check('User A PATCH own session status -> 200', patchA.status === 200, String(patchA.status));

  // 8. Second user can create their own session
  const createdB = await req('POST', '/api/sessions', TOKEN_B, { mode: 'CODING', difficulty: 'Hard' });
  check('User B can create their own session -> 201', createdB.status === 201, String(createdB.status));
  check('User B session stamped userId=user-b', createdB.body && createdB.body.data && createdB.body.data.userId === 'user-b', JSON.stringify(createdB.body));

  const listB2 = await req('GET', '/api/sessions', TOKEN_B);
  const listB2Ids = listB2.body && Array.isArray(listB2.body.data) ? listB2.body.data.map((s) => s.id) : [];
  check('User B list includes own new session', listB2Ids.includes(createdB.body.data.id), listB2Ids.join(','));
  check('User B list still excludes user A session', !listB2Ids.includes(sessionAId), listB2Ids.join(','));
}

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

  const app = require('../dist/app.js').default;
  const sessionsModule = require('../dist/routes/sessions.js');

  console.log('\n[Auth] JWT auth + session ownership');
  await sessionsModule.initSessionStore();
  const { server, port } = await listen(app);
  base = `http://127.0.0.1:${port}`;

  try {
    await runTests();
  } finally {
    await close(server);
    await new Promise((r) => setTimeout(r, 400));
    restore(SESSIONS_FILE, sessBackup);
  }
}

main()
  .then(() => {
    console.log(`\n==== Auth smoke: ${passed} passed, ${failed} failed ====\n`);
    if (failed > 0) {
      console.log('Failed checks:', failures.join(' | '));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Auth smoke crashed:', err);
    process.exit(2);
  });
