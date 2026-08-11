# InterviewPilot AI — AI Interview Copilot

An end-to-end AI interview copilot: upload a resume and job description, get a
deterministic match analysis, explore your GitHub profile, then be interviewed
by an adaptive AI interviewer — in text or in real-time **voice** — with
AI-generated feedback and metrics.

```
frontend/  React + TypeScript + Vite (Vercel)
backend/   Node 22 + Express + TypeScript + Socket.IO (Render)
docs/      Architecture, security & phase reports
```

## Features

- **Resume / JD intelligence** — PDF + text parsing, structured profile
  extraction, deterministic match scoring, gap analysis.
- **GitHub analyzer** — SSRF-safe repo analysis: architecture, technology
  profile, evidence-grounded questions, resume-vs-GitHub consistency score.
- **Coding engine** — coding problems, multi-language execution via Judge0.
- **Adaptive coding interview** — phase-5 engine with adaptive difficulty and
  metrics.
- **Realtime voice interview** — text-to-speech / speech-to-text UI, state
  machine, interruption handling, per-answer timing and derived metrics.
- **Authentication & authorization** — JWT accounts (register/login via
  Supabase), per-user session ownership enforced at the route + Socket.IO
  layer, legacy-session back-compat.
- **Persistence** — sessions survive restarts; `user_id` + voice metadata
  round-trip through the database stores.
- **AI gateway** — pluggable provider chain (`AI_PROVIDER_ORDER`), primary
  OmniRoute (in-container), opencode fallback, offline mock fallback so the app
  never breaks.

## Repository layout

| Path | What |
| --- | --- |
| `backend/` | Express API, Socket.IO `/interview`, stores, AI gateway, smoke tests |
| `frontend/` | React SPA (interview, dashboard, auth, voice UI) |
| `docs/` | PRD/SRS/design docs and phase reports (53–56 cover voice, auth, production) |
| `render.yaml` | Render Blueprint — single-container backend + OmniRoute |
| `.github/workflows/ci.yml` | Offline deterministic test battery + Docker boot checks |

## Prerequisites

- Node.js 22+
- npm
- A Supabase project (or any Postgres) for the sessions store
- (Production) Docker for the Render container image

## Local development

```bash
# Backend
cd backend
npm install
cp .env.example .env        # fill in values (Supabase keys etc.)
npm run dev                 # API + Socket.IO on http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env.local  # optional: VITE_BACKEND_URL
npm run dev                 # SPA on http://localhost:5173 (proxies /api + /socket.io)
```

> Local runs without Supabase credentials fall back to the JSON-file store
> (`backend/data/sessions.json`) so the app works offline.

### Environment variables

See `backend/.env.example` for the full documented list. Core variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | production | Signs account tokens; server refuses to boot in production without it |
| `SUPABASE_URL`, `SUPABASE_KEY` | store | Supabase project URL + publishable key for the sessions store |
| `SUPABASE_SERVICE_ROLE_KEY` | auth | Backend-only key for the `users` table (never expose to the frontend) |
| `FRONTEND_URL` | production | CORS origin for REST + Socket.IO (exact deployed frontend URL) |
| `AI_PROVIDER_ORDER` | optional | Provider chain, e.g. `omniroute,opencode` |
| `OMNIROUTE_URL`, `OMNIROUTE_MODEL` | optional | In-container AI gateway on `http://127.0.0.1:20128` |
| `JUDGE0_URL`, `JUDGE0_API_KEY`, `JUDGE0_HOST` | optional | Code execution; defaults to public CE endpoint |

Frontend: `VITE_BACKEND_URL` — backend base URL. Empty = same-origin (dev
proxy). In production set it to the deployed Render URL.

### Database setup (Supabase)

1. Create a Supabase project.
2. Open the **SQL editor** and run `backend/db/schema.sql` once (creates the
   `users` and `sessions` tables, including `user_id` + `voice` columns).
3. (Optional) Create a public **Storage** bucket `resumes` so uploaded resumes
   can be re-downloaded from History.

The backend connects with the publishable key for `sessions` (RLS-protected)
and the service-role key for `users`. If you prefer any Postgres via `pg`, set
`DATABASE_URL` — the schema is then auto-created at boot.

## Running the tests

The backend ships deterministic, offline smoke suites (no network, no real DB —
they isolate `SUPABASE_URL`/`DATABASE_URL` and back up/restore the JSON store).
From `backend/`:

```bash
npm run build && npm run test:auth
npm run test:persistence   # user_id + voice round-trips, restart reload
npm run test:smoke         # core REST + persistence
npm run test:phase3        # coding engine
npm run test:phase5        # adaptive coding interview
npm run test:phase5metrics # coding metrics
npm run test:phase6        # realtime voice interview
npm run test:intelligence  # resume/JD intelligence
npm run test:resumejd      # resume/JD matching
npm run test:github        # GitHub analyzer
```

Frontend: `npm run build` and `npm run lint` in `frontend/`.

## Deployment

Deployment is **two services**: backend (Render, one Docker container running
both the API and the OmniRoute AI gateway via `backend/supervisor.sh`) and
frontend (Vercel).

1. **Supabase** — create the project, run `backend/db/schema.sql`, create the
   `resumes` bucket (optional).
2. **Render** — New → Blueprint → this repo → `render.yaml`. Fill the
   `sync: false` secrets in the dashboard (`JWT_SECRET`, `FRONTEND_URL`,
   `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optional
   S3/Judge0 keys). Health check: `/api/health`.
3. **Vercel** — import `frontend/`, set `VITE_BACKEND_URL` to your Render URL,
   deploy (SPA rewrites configured in `vercel.json`).
4. **Verify** — `GET /api/health` returns `healthy`; register/login; create a
   session; confirm cross-user isolation (404) and voice-config persistence.

See `docs/55_Production_Deployment_Readiness.md` for the full deployment and
post-deploy smoke checklist.

## Security notes

- `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are backend-only — never expose
  them to the frontend or commit them. `.env` files are git-ignored.
- `AUTH_TEST_MODE=true` is a test-only bypass — never set it in a deployed
  environment.
- The GitHub analyzer validates URLs against SSRF (no internal hosts, no
  userinfo, no query injection).
- Request rate limiting, Helmet security headers, and a 2 MB body cap are on by
  default.
