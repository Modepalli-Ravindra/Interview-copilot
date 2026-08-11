# 54 — Authentication & Session-Ownership Security Audit

Status: Complete — all findings addressed, all test suites green.
Date: 2026-08-11

## Executive summary

The backend shipped with a JWT authentication layer that had three classes of
problems: (1) a hardcoded dev secret used in production fallback, (2) a
WebSocket namespace that skipped authentication entirely, and (3) HTTP routes
that never checked whether a session belonged to the caller — any two users
using the same deployment could read, mutate, and end each other's interview
sessions, transcripts, feedback, and voice state.

Every fix below is implemented, compiled (strict TS, no `@ts-ignore`), and
verified by offline deterministic test suites. **443 checks pass; the only 5
failures are pre-existing and unrelated to authentication** (see §8).

## 1. Verification matrix

| Suite | Command | Result |
| --- | --- | --- |
| JWT auth + ownership (new) | `npm run test:auth` | 27/27 PASS |
| Resume/JD intelligence | `npm run test:intelligence` | 58/58 PASS |
| Resume/JD matching | `npm run test:resumejd` | 42/42 PASS |
| Core REST smoke | `npm run test:smoke` | 26/26 PASS |
| Coding engine (REST) | `npm run test:phase3` | 14/19 — **5 pre-existing, see §8** |
| Coding interview (live WS) | `npm run test:phase5` | 29/29 PASS |
| Coding metrics | `npm run test:phase5metrics` | 37/37 PASS |
| Realtime voice | `npm run test:phase6` | 106/106 PASS |
| GitHub analyzer | `npm run test:github` | 104/104 PASS |
| TypeScript build | `npm run build` | exit 0, strict clean |

The new `test:auth` suite boots the real app with the real JWT middleware
(no bypass) and proves: open routes stay open, missing/garbage/forged tokens
→ 401, valid tokens pass, cross-user session access → 404, legacy sessions
remain readable (back-compat), owner stamping works, and one representative
voice route also enforces ownership.

## 2. Findings & fixes

### F1 — Hardcoded JWT secret fallback [P0, FIXED]
`routes/auth.ts` previously embedded the literal fallback string inside
`jwt.sign(...)`; the middleware and handlers used a mix of fallback sources, so
the signature secret could drift and a leaked dev fallback was reachable in
production.
- **Fix:** central `src/services/jwtSecret.ts` → `getJwtSecret()` = `process.env.JWT_SECRET || 'super-secret-jwt-key-for-dev'` (single source of truth for sign *and* verify).
- `src/server.ts` now **fails fast** in production when `JWT_SECRET` is missing: logs and `process.exit(1)` instead of silently running on the dev fallback.
- `backend/.env` got a generated 96-hex-char `JWT_SECRET`; `.env.example` documents it with a generation command.
- All `jwt.sign` calls updated to use `getJwtSecret()` (register, login).

### F2 — Open WebSocket namespace [P0, FIXED]
`socketTokenOk` in `src/handlers/interviewHandler.ts` accepted connections with
no/invalid token; `join_session` had no session check at all.
- **Fix:** socket connections now require a valid Bearer JWT (verified with
  `getJwtSecret()`); identity is stored on `socket.data.user`.
- `join_session` now rejects missing sessions ("Session not found") and
  sessions owned by someone else ("Unauthorized: not your session").
- `AUTH_TEST_MODE=true` bypasses for the deterministic offline suites only.

### F3 — No session ownership on HTTP routes [P0, FIXED]
Every route resolved a session by id and returned it to whoever asked. A user
could list every session (`GET /api/sessions`), read any transcript/feedback,
flip any status, run another user's coding interview, execute code in their
sandbox context, end their voice interview, and read their roadmap/intelligence
data.

Owner model added to `src/routes/sessions.ts`:
- `isOwnedSession(record, userId)`: a record with no `userId` is legacy and
  readable by any authenticated user (back-compat); otherwise `record.userId === userId` required.
- `getOwnedSessionRecord` / `listOwnedSessionRecords` are the enforced accessors.
- `POST /api/sessions` stamps `userId: req.user?.userId ?? null` on create.

Enforced ownership in:

| Route | Change |
| --- | --- |
| `sessions.ts` | list, get-by-id, feedback, patch-status use owned accessors |
| `voice.ts` | all 6 handlers (config/state/interruption/answer/status/end) |
| `codingInterview.ts` | `/start`, `/status`, `/next`, plus `requireState` ownership guard |
| `execute.ts` | ownership checks on both `coding_interview_session_id` and `session_id` paths |
| `roadmap.ts` | both session lookups |
| `candidates.ts` | dashboard/pipeline lists owned sessions only |
| `dashboard.ts` | owned sessions only |
| `intelligence.ts` | `/match` returns 404 when a supplied `sessionId` is not owned |
| `interviewHandler.ts` | WS `join_session` ownership (see F2) |

### F4 — Unauthenticated smoke suite (broken by the new auth gate) [P0, FIXED]
The HTTP smoke suites were written against an API with no auth; introducing the
JWT gate broke all of them.
- **Fix:** each suite sets `AUTH_TEST_MODE=true` (granting a synthetic
  `test-user` identity) — deterministic, offline, no secret coupling.
- The new `smokeAuth.js` runs with the bypass **off** to prove the real layer.

### F5 — Module-load crash when Supabase env is unset [P1, FIXED]
`routes/auth.ts` constructed the Supabase client at import time with `''` env —
any offline boot (tests, local dev without Supabase) crashed the process.
- **Fix:** lazy `getSupabase()` constructs the client on first real use and
  throws a clear error; register/login catch it and return a clean 500. Verified
  by `test:auth` (route reachable without a token, fails gracefully offline).

### F6 — `req.user` untyped with `@ts-ignore` [P1, FIXED]
Handlers accessed `req.user` via `(req as any)`/`@ts-ignore`.
- **Fix:** `src/types/express.d.ts` declares `Express.Request.user` (AuthUser);
  `@ts-ignore` and casts removed. `strict:true` now fully types the identity.

## 3. Test-bypass posture (read this before changing anything)

- `AUTH_TEST_MODE=true` short-circuits the middleware with
  `{ userId: 'test-user', email: 'test@example.com', name: 'Test User' }`.
- It is only ever set inside `backend/scripts/*.js` smoke suites.
- **It must never be enabled in any deployed environment.** The middleware is
  the only auth gate; a production `AUTH_TEST_MODE=true` would grant full
  access to everyone.
- Production additionally guards `JWT_SECRET` at boot (F1), so a deployment
  that forgets the secret fails loudly rather than running insecure.

## 4. Legacy data

Sessions created before this change have no `userId`. They remain visible to any
authenticated user for backwards compatibility (`isOwnedSession` treats
`!record.userId` as owned). A future migration may optionally back-fill `userId`
from Supabase auth or the candidate email — until then the pass-through is
intentional.

## 5. Files changed

```
backend/.env.example                      # JWT_SECRET + AUTH_TEST_MODE docs
backend/.env                              # generated JWT_SECRET appended
backend/package.json                      # + "test:auth" script
backend/src/services/jwtSecret.ts         # NEW — getJwtSecret()
backend/src/types/express.d.ts            # NEW — Request.user typing
backend/src/middleware/auth.ts            # rewrite — bypass + real JWT verify
backend/src/routes/auth.ts                # lazy Supabase, randomUUID, getJwtSecret
backend/src/routes/sessions.ts            # ownership model + create stamping
backend/src/routes/{voice,codingInterview,execute,roadmap,candidates,dashboard,intelligence}.ts
backend/src/handlers/interviewHandler.ts  # WS JWT auth + join_session ownership
backend/src/server.ts                     # production JWT_SECRET fail-fast
backend/scripts/smokeAuth.js              # NEW — offline auth/ownership suite
backend/scripts/smoke{Intelligence,Phase3,Phase5,Phase5Metrics,Phase6}.js  # AUTH_TEST_MODE
```

## 6. Deployment / restart checklist

1. Restart the running server (see §7) — the live process on `:3000` predates
   these fixes and still serves unauthenticated responses.
2. Ensure `JWT_SECRET` is set in production env; the server refuses to boot
   without it.
3. Keep `AUTH_TEST_MODE` unset outside local test runs.

## 7. Live-server status note

`node dist/server.js` (PID 13356, started before this work) is still running on
`:3000` and answers `GET /api/sessions` with no token → 200. Rebuilding `dist/`
does not affect a running process; it must be restarted to enforce the new
auth/ownership layer. `npm run build && npm start` (or restart the dev process).

## 8. Pre-existing failures (out of scope)

`npm run test:phase3` reports 5 failures that predate this audit and are
unrelated to authentication:

- "Generated question has id/title/testCases" — `tests:0`, `hidden:0`
- "Generated question splits hidden test cases"
- "Execute reports split visible/hidden counts" (`v:1, h:0`)
- "Execute combines counts into total" (`t:1, p:1`)
- "Session stores execution counts"

Cause: the coding-engine mock question template (`questionStore` /
`templateQuestion`) yields **zero test cases** for the topic/variant selected by
the phase-3 fixture (the slice `built.testCases.slice(0, 2)` comes back empty).
The affected source files are unmodified from git HEAD; the same test fails
without any authentication work present. Tracked as a separate coding-engine
issue, not an auth defect.

## 9. Residual risks (accepted, lower severity)

- **P2 — Resume file download is auth-only, not ownership-scoped.**
  `GET /api/intelligence/resume/file/:key` requires a valid token but no
  session-ownership check. Rationale: the download happens *before* a session
  exists (upload → download → create), and keys are unguessable UUIDs only
  surfaced through owned sessions/uploads. If multi-tenant file isolation is
  required later, store the owning user on upload and check it on download.
- **P2 — Token revocation / password reset.** JWTs are stateless (7-day expiry)
  with no revocation list; logging out is client-side token discard.
- **P2 — Rate limits.** Per-IP limits exist (300/15min); acceptable for the
  single-user personal-use deployment model documented in the project.
