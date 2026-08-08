# Architecture Audit — InterviewPilot

**Phase:** 1 of the phased production plan (audit → docs → AI layer → OmniRoute → fallback → providers → agent → voice → sockets → security → Docker → CI/CD → Vercel → Oracle docs → tests → verification).
**Date:** 2026-08-08
**Status:** Complete (as-built verified against source)

> **Implementation progress (updated 2026-08-09):**
> - **Phase 1–7, 10, 11 done.** AI layer is a ProviderRouter facade — primary **OmniRoute**
>   (`127.0.0.1:20128`, free providers, `model: auto`) → **opencode** fallback → deterministic
>   mock. Fallback chain verified in all three states; fixed a `localhost`→`::1` IPv6 bug.
> - **Phase 6 done:** session persistence is a pluggable store — **Supabase Postgres**
>   (`sessions` table, `backend/db/schema.sql`, permissive RLS policy) with JSON-file fallback;
>   `npm run db:migrate` migrated 5 sessions (verified live).
> - **Phase 7 done:** interview engine deepened (per-mode rubrics, probing/teaching/vague turns,
>   transcript persistence, configurable maxTurns).
> - **Phase 10 done:** auth seam (`middleware/auth.ts`, `AUTH_ENABLED`/`AUTH_TOKEN`), rate
>   limiting + payload caps, socket IP cap + turn throttle; verified live on prod build.
> - **Phase 11 done:** backend `Dockerfile` (multi-stage) + root `docker-compose.yml`
>   (backend + official OmniRoute image, healthchecks, restart policy, named volumes).
>   Local runtime verified by booting the exact prod artifact (`node dist/server.js`);
>   container build deferred to Render (Phase 14) — Docker not installed locally.
> - **Phase 14 in progress:** Render deploy artifacts written — `backend/Dockerfile.render`
>   (single container: official OmniRoute image + layered backend), `backend/supervisor.sh`
>   (both processes, signal forwarding, self-heal, 512MB budget), root `render.yaml`
>   Blueprint (`plan: free`, `healthCheckPath: /api/health`, secrets `sync: false`).
>   Validated: render.yaml YAML + supervisor.sh `sh -n` + prod artifact boot. **Manual steps
>   pending:** git init + push to GitHub, then Render Dashboard → New → Blueprint; the repo
>   is not a git repo yet and no Render account/API key is available from this machine.
> - **Git repo + Phase 12 done:** repo initialized (128 files, no secrets tracked), initial
>   commit `104b064`; `.github/workflows/ci.yml` (backend tsc build, frontend oxlint+vite
>   build, dockerfile build of both images + `bash -n` supervisor.sh), `docs/40_CICD_Guide.md`
>   §6 as-built. CI is validation-only — Render (Blueprint commit trigger) and Vercel (git
>   integration, Phase 13) deploy from `main`.
> - **Phase 2 docs reconciled** in `docs/08, 13, 14, 39, 41, 47` (as-built headers).

This document records the *actual* implementation as it exists today, separates real functionality from mock/fallback paths, and lists the blockers and decisions that gate the production plan. It is the reference for all subsequent phases.

---

## 1. Repository layout (as-built)

```
Interview-Copilot/
├── backend/                 Node + Express + Socket.IO (TypeScript)
│   ├── src/
│   │   ├── app.ts           Express app: helmet, cors, parsers, routes, error handler
│   │   ├── server.ts        HTTP server + Socket.IO /interview namespace
│   │   ├── handlers/
│   │   │   └── interviewHandler.ts   socket join/message/barge_in/end_session/disconnect
│   │   ├── routes/          health, sessions, analysis, execute, problems, dashboard, roadmap, github
│   │   └── services/        aiGateway, interviewEngine, feedback, roadmap, resumeAnalyzer
│   ├── data/                JSON-file persistence (sessions.json, github-cache.json)
│   ├── dist/                compiled output (tsc)
│   ├── .env                 gateway + server config (masked, not committed)
│   └── package.json         deps: express, socket.io, cors, helmet, dotenv, uuid (+dev: ts-node-dev, typescript)
├── frontend/                React 19 + Vite + Tailwind v4 (TypeScript)
│   └── src/
│       ├── pages/           Landing, Auth(unused), Dashboard, Interviews, Coding, Roadmap, History, Settings, Interview
│       ├── components/      layout/DashboardLayout, interview/{AiAvatar, VoiceWidget, TranscriptPanel, CodeWorkspace}
│       ├── hooks/           useSpeechRecognition, useSpeechSynthesis (Web Speech API)
│       ├── stores/          interviewStore (zustand)
│       ├── services/        socketService (socket.io-client)
│       ├── types/           index.ts
│       ├── App.tsx          react-router-dom v7 routes
│       └── main.tsx
└── docs/                    50 spec documents (Vision … Milestone_Plan) + this audit
```

No git repository, no CI/CD, no Docker files, no database, no test suite, no root README/.gitignore/.env.example.

---

## 2. Backend — verified surface

### 2.1 REST routes (`backend/src/app.ts:36-43`)

| Method | Path | File | What it does |
|---|---|---|---|
| GET  | `/api/health` | routes/health.ts | Liveness |
| POST | `/api/sessions` | routes/sessions.ts:44 | Create session (mode/role/company/resume/jd/github) |
| GET  | `/api/sessions` | routes/sessions.ts:121 | List all (newest first) |
| GET  | `/api/sessions/:id` | routes/sessions.ts:81 | Session detail |
| GET  | `/api/sessions/:id/feedback` | routes/sessions.ts:90 | Feedback report or 404 |
| PATCH| `/api/sessions/:id/status` | routes/sessions.ts:102 | SETUP/ACTIVE/COMPLETED/FAILED |
| POST | `/api/analysis/resume` | routes/analysis.ts:8 | Resume analysis via gateway |
| POST | `/api/execute` | routes/execute.ts:114 | Run code on Judge0 CE (no key) |
| GET  | `/api/problems` | routes/problems.ts:88 | 5 static problems |
| GET  | `/api/dashboard` | routes/dashboard.ts:8 | Aggregated stats from sessions |
| POST | `/api/roadmap` | routes/roadmap.ts:8 | Generate/cached roadmap |
| GET  | `/api/github/:username` | routes/github.ts:151 | Public GitHub profile |
| GET  | `/api/github/:username/:repo` | routes/github.ts:229 | Deep repo read (README+tree+top files), 1h cache |

### 2.2 Persistence — no database

`backend/src/routes/sessions.ts:11-41` persists everything to `backend/data/sessions.json` via a debounced `fs.writeFileSync` (300ms). The GitHub repo-detail cache lives in `backend/data/github-cache.json` with a 1h TTL (routes/github.ts:47-49). No SQL, no ORM, no external store. Single-writer, single-process assumption.

### 2.3 Socket.IO — `/interview` namespace (`server.ts:23-24`)

In-memory state only: `interviewStates` Map (sessionId → InterviewState), `socketSessions`, `busySessions` (`handlers/interviewHandler.ts:14-16`). Events:

- `join_session` → creates state, emits `session_joined` (gateway status), starts the interview (`startInterview`), emits `resume_analysis` + first question
- `text_message` → evaluates via `handleInterviewAnswer`, emits `transcript_update`, and when turn limit hits, `finalizeSession` generates feedback + roadmap and emits `session_ended`
- `barge_in` → aborts in-flight generation, emits `clear_audio_buffer`
- `end_session` → finalize or emit `session_ended`
- `disconnect` → cleanup

Busy-set prevents concurrent generation per session. `thinking` events toggle the frontend indicator.

---

## 3. AI layer — verified flow

### 3.1 Gateway (`services/aiGateway.ts`)

- HTTP client for `opencode serve` at `OPENCODE_SERVER_URL` (default `http://127.0.0.1:4096`).
- `POST /session` → create; `POST /session/:id/message` → send; optional basic auth from `OPENCODE_SERVER_USERNAME`/`PASSWORD`; optional `model` param mapped to `{providerID, modelID}`.
- **Mock fallback:** any failure returns `fromMock: true` and callers switch to deterministic logic. `config.enabled` is always effectively true unless the URL is literally `"disabled"` (aiGateway.ts:44) — there is no provider routing, no API key, no quota tracking.

### 3.2 Consumers

| Consumer | Live path | Mock/fallback path |
|---|---|---|
| interviewEngine.ts | System prompt (persona + resume + JD + GitHub) → `startInterview` / `handleInterviewAnswer` | 4 canned questions with keyword matching (`MOCK_QUESTIONS`) |
| feedback.ts | Transcript → JSON feedback report | `deriveFromTranscript`: score heuristics from turn counts/verbosity |
| roadmap.ts | Role/focus areas → JSON roadmap | `deriveRoadmap`: template from focus areas |
| resumeAnalyzer.ts | Resume → JSON analysis | `mockAnalysis`: keyword extraction + canned questions |

Every AI-backed service isolates its prompt and JSON parser, so swapping the gateway (e.g., to OmniRoute) is a change to `aiGateway.ts` only — the callers stay untouched. This is the main reuse asset.

### 3.3 Code execution (`routes/execute.ts`)

Judge0 CE (`https://ce.judge0.com`, no key) for python/javascript/go/java/cpp. Submits all test cases in parallel (`wait=true`), compares trimmed stdout to expected, maps status ids. Offline fallback assumes all tests pass if the code is non-empty (with an explicit `fromMock: true` + "offline sandbox" note). Verified working end-to-end earlier.

### 3.4 GitHub integration (`routes/github.ts`)

Real public API (no token). Profile: user + 100 repos → top languages/stars. Deep read: README (6k chars), file tree (filtered, ≤250 paths), top 3 source files (2.5k chars each) with interest scoring. Cached 1h to respect the unauthenticated 60 req/h limit. PROJECT-mode prompts instruct the model to ask about the actual code (interviewEngine.ts:68-77). Verified live against real repos.

---

## 4. Frontend — verified surface

- **React 19 + Vite 8 + TypeScript + Tailwind v4.** Router v7. Zustand store. framer-motion + lucide-react.
- **Voice is 100% browser-native Web Speech API** — `useSpeechRecognition` (STT) and `useSpeechSynthesis` (TTS). No server-side voice, no paid vendor. Real-time in-browser; barge-in just cancels TTS + aborts the gateway generation.
- InterviewPage (870 lines) is the live session screen: socket wiring, TTS of incoming AI messages, waveform animator, resume-analysis sidebar, feedback modal, and Code tab (native textarea — Monaco placeholder).
- No API service module; pages call `fetch('/api/…')` directly and rely on the Vite dev proxy (`vite.config.ts:10-21`) to `localhost:3000`. Socket connects via default Vite `/socket.io` proxy too.
- Auth is stubbed: `/auth` redirects to `/dashboard` (App.tsx:18); `AuthPage.tsx` exists but is unrouted.

---

## 5. Real vs. mock inventory (the honest picture)

| Capability | Real today? | Notes |
|---|---|---|
| REST + persistence | Yes | JSON file, single process |
| Live AI interview | Conditional | Only when local `opencode serve` is running on 4096; else full mock flow |
| Feedback/roadmap/analysis | Conditional | Live with gateway, deterministic otherwise |
| Code execution | Yes (Judge0 CE) | Offline fallback is optimistic, not real |
| GitHub deep read | Yes | Cached, rate-limited |
| STT / TTS | Yes | Browser Web Speech API only (Chrome/Edge) |
| Auth / multi-user | No | Single anonymous user; `/auth` stubbed |
| Database | No | JSON files |
| OmniRoute provider routing | No | Not installed, port 20128 closed |
| Docker / CI/CD / Vercel / Oracle | No | Not started |

---

## 6. Gaps vs. the 50-doc production spec

1. **Frontend language mismatch.** Spec says JavaScript; implementation is TypeScript. TS compiles to plain JS and adds type safety; a TS→JS rewrite is large, risky, and contradicts the "don't rebuild working features" mandate. **Recommendation: keep TS.**
2. **Database absent.** `08_Database_Design.md`/`09_ER_Diagram.md` describe a real DB. Current JSON store works for one user. Adding Postgres (Supabase/Neon) adds keys + cost + migration risk.
3. **Auth/authorization absent** (docs 17/18). No users, no JWT, no roles. Single-user app may not need it for launch.
4. **AI gateway not production-grade.** No provider abstraction, no OmniRoute, no free-provider fallback chain, no quota/rate-limit awareness. `opencode serve` Zen free tier is rate-limited and "not intended for production."
5. **Hosting cost conflict.** Oracle Cloud ARM VM is ~$0.50/hr (~₹440/mo), which violates the ₹0/month goal. Vercel frontend is free; the backend has no zero-cost home yet.
6. **State is process-local.** In-memory `interviewStates` Map means any restart loses active sessions; with one VM + one user this is tolerable.
7. **Bundle size.** `index-*.js` ≈ 549 kB — splittable but not blocking.
8. **Security baseline.** Helmet + CORS present, but no input rate limiting, no session isolation, no secrets management, `.env` uncommitted but no `.env.example` documented.

---

## 7. Blockers — resolutions (decided 2026-08-08)

| # | Decision | Resolution | Impact |
|---|---|---|---|
| B1 | Frontend language | **Keep TypeScript** | No rewrite; TS compiles to plain JS |
| B2 | OmniRoute | **Free path verified — MIT license, self-hosted, local proxy** | Installable via `npm i -g omniroute`; OpenAI-compatible on `:20128`; includes `opencode-zen`/keyless free providers; quota-aware auto-fallback |
| B3 | Database | **Add Postgres (Supabase/Neon)** | Replace JSON-file store with a Postgres-backed sessions store; keep JSON as legacy import |
| B4 | Backend hosting | **Zero-cost research done — see §7.1** | Render free (750h/mo, sleeps) / SnapDeploy (free forever, Docker+WS) |
| B5 | Auth | **Add simple auth later** | Design the seam in Phase 10; implement post-launch |

### 7.1 Zero-cost hosting research (2026-08-08)

Backend needs **persistent WebSockets** (Socket.IO) → rules out serverless (Cloud Run 300s WS cap, Vercel functions). Candidates:

| Platform | Cost | WS | Postgres | Gotchas |
|---|---|---|---|---|
| **Render** free | $0 (750h/mo) | Yes; free tier now **stays alive on WS traffic** | Free Postgres only 90 days | 15-min idle spin-down; 30–50s cold start |
| **SnapDeploy** free | $0 forever, no card | Yes | No | 4 containers × 512MB; newer/smaller platform |
| Railway | $5 trial credit only | Yes | Yes | Free tier removed 2023; credit depletes |
| Fly.io | $10–23/mo | Yes | Self-managed | Free allowances removed 2024 |
| Koyeb | 1 free service | Yes | Limited | Cold starts |

**Recommendation:** Render free tier for the backend (well-known, WS-keepalive fix, Docker-capable), and **Neon** (serverless Postgres, ~1s scale-up, no data loss) for B3 since the DB lives outside the backend host anyway. Oracle ARM VM is dropped — it violated the ₹0 goal.

### 7.2 OmniRoute findings (2026-08-08)

- **License: MIT**, open source (`github.com/diegosouzapw/OmniRoute`, 43k★), self-hosted, local-first, zero telemetry.
- One command install: `npm install -g omniroute`; dashboard + API on **port 20128**.
- Zero-config `model: "auto"` works immediately; catalog includes the same keyless free providers the app uses today (OpenCode Zen, Pollinations, etc.) plus 90+ free tiers with **quota-aware auto-fallback** — exactly the Phase 5 fallback chain.
- API is **OpenAI-compatible** (`POST /v1/chat/completions`), so `aiGateway.ts` must add an OpenAI-style provider adapter (Phase 3 abstraction enables this; the current opencode `/session/:id/message` client becomes a second adapter).
- ToS note: several keyless providers are flagged `avoid` for *proxying*; a **single-user, self-hosted personal app** is the explicitly permitted use case. Fine for this project.

## 8. Migration plan (how phases map to this codebase)

| Phase | Work | Files touched |
|---|---|---|
| 2. Docs | Update deployment/API docs to match reality | `docs/` |
| 3. AI layer | Extract `AIService`/`ProviderRouter` interface; add OpenAI-style adapter (keep existing opencode client as a second adapter) | `services/aiGateway.ts`, new `services/providerRouter.ts` |
| 4. OmniRoute | Install (`npm i -g omniroute`), wire as primary provider on `:20128` | config, provider router |
| 5. Fallback | Free-provider chain (OmniRoute `auto` + deterministic `fromMock` paths) | provider router |
| 6. Database | Replace JSON-file sessions store with Postgres (Neon); migrate existing `data/sessions.json` | routes/sessions.ts, new `db/` |
| 7. Agent | Deepen interview engine prompts/agent loop | interviewEngine.ts |
| 8. Voice | Document browser-native as final (no server TTS/STT) | docs |
| 9. Sockets | Resilience: reconnect, resume in-flight, persistence of active states | interviewHandler.ts |
| 10. Security | Rate limiting, payload caps, secret hygiene, auth seam (B5) | app.ts, new middleware |
| 11. Docker | Backend Dockerfile + compose | new `Dockerfile`, `docker-compose.yml` |
| 12. CI/CD | GitHub Actions lint+build+test | new `.github/workflows` |
| 13. Vercel | Frontend deploy | frontend config |
| 14. Deploy | Backend on Render free tier (§7.1) | `render.yaml`, docs |
| 15. Tests | Test harness for services/routes | new test setup |

---

## 9. Summary

The app is a **working, single-user, offline-capable** mock-interview product. The core value — real AI interviews, feedback, roadmaps, Judge0 execution, GitHub deep-reads — is implemented and verified. All five blockers are now resolved: keep TS, add OmniRoute (MIT/free), add Postgres (Neon), host on Render free (drop Oracle), auth later. No existing feature needs to be rebuilt; the AI layer is already architected so the gateway is swappable behind `fromMock`. Next executable phase: **Phase 3 (ProviderRouter) + Phase 4 (OmniRoute install)**.
