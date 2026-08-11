# 55 — Production Deployment Readiness

Status: PASS (with the required external values listed below)
Date: 2026-08-11

This document records the production-readiness check done before deploying.
It does not contain real secrets — only variable names you must fill in on the
hosting platforms.

## A. Required external values (configure these on Render/Vercel)

| Variable | Required | Where |
| --- | --- | --- |
| `JWT_SECRET` | YES | Render env var (long random string) — backend refuses to boot without it |
| `SUPABASE_SERVICE_ROLE_KEY` | YES | Render env var — registration/login + session store |
| `SUPABASE_URL` | YES | Render env var (project URL) |
| `SUPABASE_KEY` | YES | Render env var (publishable key, server-side only) |
| `FRONTEND_URL` | YES | Render env var — exact deployed frontend origin (CORS + Socket.IO) |
| `VITE_BACKEND_URL` | YES | Vercel env var — full deployed backend origin (REST + Socket.IO) |
| `SUPABASE_S3_ENDPOINT` | OPTIONAL | Render env var — required only if you want resume file re-download from History |
| `SUPABASE_S3_ACCESS_KEY` | OPTIONAL | Render env var |
| `SUPABASE_S3_SECRET_KEY` | OPTIONAL | Render env var |

Nothing else is needed. OmniRoute is bundled in the same Render container and
needs no API key. GitHub analysis uses the unauthenticated public API
(~60 req/hr) — there is no token variable and the app handles rate limits
gracefully.

## B. render.yaml (fixed in this pass)

- Removed the dead `AUTH_ENABLED` / `AUTH_TOKEN` variables (read by no code;
  previously documented in `39_Deployment_Guide.md` only).
- Removed the hardcoded `SUPABASE_URL` value.
- Added `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
  `SUPABASE_KEY`, `FRONTEND_URL`, and the S3 options — all `sync: false` so no
  secrets are committed and no values are auto-injected.
- Kept `AI_PROVIDER_ORDER=omniroute`, `OMNIROUTE_URL=http://127.0.0.1:20128`,
  `OPENCODE_SERVER_URL=disabled`, gateway retries, and the
  `OMNIROUTE_MEMORY_MB` heap cap.
- `docs/39_Deployment_Guide.md` is stale (auth-env era) — do not follow its
  env instructions; this file supersedes it.

## C. Frontend configuration

- `VITE_BACKEND_URL` drives both REST (`src/lib/api.ts`) and Socket.IO
  (`src/services/socketService.ts`). There is no `localhost`/`:3000` anywhere
  in `frontend/src` (dev-only proxy lives in `vite.config.ts`).
- `frontend/.env.example` documents `VITE_BACKEND_URL=`; no `.env` file is
  committed. No secrets belong in `VITE_*` and none are.

## D. AI provider path

### Chain
`aiGateway` → `providerRouter` (ordered by `AI_PROVIDER_ORDER`) → provider
adapter → mock fallback.

### OmniRoute (in-container) — READY
- `Dockerfile.render` stage 2 starts from `diegosouzapw/omniroute:latest` and
  layers the backend in; `supervisor.sh` runs OmniRoute on
  `http://127.0.0.1:20128` (heap `OMNIROUTE_MEMORY_MB`, default 320MB) and the
  backend on Render's `$PORT` (96MB heap), waits 2s between starts, and
  restarts dead children. Only `$PORT` is reachable externally; OmniRoute is
  loopback-only.
- The OpenAI-compatible adapter talks to `OMNIROUTE_URL` (no auth header when
  no key is set), lazily probes on first session creation, and falls back to
  the next provider/mock if OmniRoute is down or its upstream free providers
  fail.
- Caveats (acceptable): upstream free providers are third-party and can be
  rate-limited; OmniRoute's on-disk quota/state is not persistent on Render
  free tier and resets on restart; the 512MB memory plan is tight
  (416MB reserved by the two processes). If you later prefer a paid model,
  point `OMNIROUTE_URL` at any OpenAI-compatible endpoint.

### OpenCode (local-only) — NOT READY for production
- `opencodeProvider` reads `OPENCODE_SERVER_URL` (default
  `http://127.0.0.1:4096`) plus username/password basic auth. It is a local
  CLI serve process and is not deployed anywhere.
- `render.yaml` sets `OPENCODE_SERVER_URL=disabled`, so the provider is
  skipped in production. It remains a local-development option only.

### Fallback + provenance (truthful, no silent fakes)
- All providers unreachable → deterministic mock (templates); the UI and API
  are explicit: `gateway.fromMock`, `feedbackSource: 'ai' | 'fallback' | 'mock'`,
  `(template)` markers on coding questions, offline-sandbox flags on execute
  results, and HistoryPage labels. Nothing pretends a mock answer was AI.
- Malformed AI JSON and rate limits (429) are handled: parsing falls back to
  derived/deterministic content, and repeated failures degrade to mock with
  truthful provenance.
- Deterministic (no LLM needed, fully offline): resume/JD parsing, matching,
  GitHub repo analysis (needs network), coding hints/adaptive/metrics, voice.

## E. Storage

- Resume files are persisted to Supabase S3 only when all three
  `SUPABASE_S3_*` values are set (`storage.isStorageConfigured`).
- Otherwise parsing and the interview still work; the uploaded PDF is simply
  not re-downloadable from History. Storage is therefore OPTIONAL.

## F. Security check — PASS

- `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are backend-only; no `VITE_*`
  secret exists; `AUTH_TEST_MODE` is test-only and not set in production.
- No hardcoded secrets/keys found in tracked files (repo scan clean).
- Backend refuses to boot without `JWT_SECRET`; Supabase store refuses user
  management without the service-role key.
- CORS and Socket.IO both use the single `FRONTEND_URL` origin (no wildcard).
- RLS is untouched: the app connects with the service-role credential only
  (no anon-key exposure), so no RLS policy changes were made or needed.
- Auth: REST 401s without token, socket handshake requires JWT, sessions are
  owner-scoped (multi-user isolation verified by tests).
- GitHub URL parsing rejects SSRF-style inputs (internal hosts, userinfo,
  query injection).

## G. Test results (all green)

| Suite | Result |
| --- | --- |
| `npm run test:auth` | 27/27 PASS |
| `npm run test:smoke` | 26/26 PASS |
| `npm run test:phase3` | 19/19 PASS (fixed this pass) |
| `npm run test:phase5` | 29/29 PASS |
| `npm run test:phase5metrics` | 37/37 PASS |
| `npm run test:phase6` | 106/106 PASS |
| `npm run test:intelligence` | 58/58 PASS |
| `npm run test:resumejd` | 42/42 PASS |
| `npm run test:github` | 104/104 PASS |
| `npm run build` (frontend: tsc + vite) | PASS (1 pre-existing lint warning, `AuthContext.tsx`) |

### Bug fixed during this pass
Mock (offline) coding questions could fall back to a non-executable template
(`trees`/`frontend`/`api`) with zero test cases, producing non-runnable
questions. `templateQuestion` now only draws from executable templates
(`codingEngine.ts`), so every generated question has visible + hidden test
cases. Verified by `test:phase3` (was 5 failures, now 19/19).

## H. Deployment checklist

1. Push to GitHub, create the Render Web Service from the repo
   (`Dockerfile.render`).
2. Fill in section A values on Render (env vars) and Vercel
   (`VITE_BACKEND_URL`), then trigger a manual deploy so secrets apply.
3. Apply `backend/db/schema.sql` in the Supabase SQL editor once
   (JS-client store cannot create tables).
4. Run `backend/db/schema.sql` only against the target Supabase project.
5. After deploy: open `/api/health` (expect `status: healthy`), log in, and
   run one live interview; the transcript should show `gateway.fromMock:
   false` when OmniRoute is answering.
6. Do NOT run `npm run dev` or `test:*` against the production database —
   the smoke scripts boot the server in-process and write to whatever store
   `DATABASE_URL`/`SUPABASE_URL` points at.
