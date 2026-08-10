# Phase 4 Report: GitHub Project Analysis

> Status: **DONE** — all backend suites and frontend checks green.
> Date: 2026-08-10

## 1. Scope

Phase 4 ships the GitHub project analysis feature: candidates paste a repository URL
(optionally with resume/JD skill context) and the app builds a grounded `ProjectProfile`
that powers consistency checks, JD-relevance scoring, a searchable project index, an
evidence-grounded question bank, and follow-up prompts for the interview.

---

## 2. What Was Built

### 2.1 Backend

| Piece | Where |
| :--- | :--- |
| Repo analyzer (ingest, classify, profile) | `backend/src/services/repoAnalyzer.ts` |
| Routes: `/api/github/analyze`, `/retrieve`, `/questions` | `backend/src/routes/github.ts` |
| Persistence columns + `toRow`/`fromRow` | `backend/db/schema.sql`, `backend/src/services/stores/postgresStore.ts`, `backend/src/services/stores/supabaseStore.ts` |
| Auto `githubSummary` on session store | `backend/src/routes/sessions.ts` |
| Analyzer tests (22 scenarios + persistence EXTRA) | `backend/scripts/testGithubAnalyzer.js`, `test:github` in `backend/package.json` |

Key behaviors:

*   **GitHub ingestion** — public repo metadata, file tree, README, file contents;
    `parseRepoUrl` rejects non-GitHub hosts, `userinfo@`, extra path segments, and
    query injection (SSRF safety).
*   **Error taxonomy** — `RepoAnalysisError` with codes `INVALID_URL`, `NOT_FOUND`,
    `PRIVATE`, `RATE_LIMITED` (403 with `x-ratelimit-remaining: 0` and 429), `EMPTY`,
    `FETCH`; mapped to HTTP statuses in the route.
*   **File classification** — 9 categories (`IMPORTANT_SOURCE`, `SOURCE`, `CONFIGURATION`,
    `DOCUMENTATION`, `TEST`, `BUILD`, `GENERATED`, `DEPENDENCY`, `ASSET`) plus `IGNORED`.
    Style files (`css`/`scss`/`sass`/`less`) classify as `SOURCE`.
*   **ProjectProfile** — repo metadata, `TechnologyProfile` (9 buckets), architecture
    (patterns, entry points, modules, data models, API endpoints), README analysis with
    corroboration/unverified-claim flags, evidence (claims backed by file paths), and a
    per-file `ProjectIndexEntry` with symbols, technologies, and related files.
*   **Consistency** (`compareResumeToGithub`) and **relevance** (`assessProjectRelevance`)
    reports with deterministic scores and non-accusatory gap notes.
*   **Retrieval** (`retrieveProjectContext`) — returns top file excerpts + related questions
    for RAG-style grounding; **question bank** (`generateProjectQuestions`, 15 categories)
    and **follow-up bank** (`prepareFollowUpBank`) are evidence-grounded.
*   **Caching** — per-repo 1-hour cache; unchanged `pushed_at` reuses the deep analysis.

### 2.2 Frontend

| Piece | Where |
| :--- | :--- |
| Project analysis page | `frontend/src/pages/GithubProjectPage.tsx` |
| Route `/dashboard/github` + nav item | `frontend/src/App.tsx`, `frontend/src/components/layout/DashboardLayout.tsx` |
| Phase-4 types | `frontend/src/types/index.ts` (`ProjectProfile`, `ProjectAnalysisResponse`, `ProjectRetrievalContext`, `ProjectQuestionBankResponse`, etc.) |

Page features: repo URL + optional resume/JD skills input, Analyze call, cached badge,
error display with per-code messaging, consistency/relevance gauges, tech profile,
architecture, README analysis, evidence, project index, question bank, follow-ups,
retrieval panel, and a "Start interview" CTA that opens a PROJECT session with the
profile attached.

---

## 3. Regression Results

| Suite | Command | Result |
| :--- | :--- | :--- |
| GitHub analyzer | `npm run test:github` | **104 passed, 0 failed** |
| Resume/JD intelligence | `npm run test:intelligence` | 58 passed, 0 failed |
| Resume/JD matching | `npm run test:resumejd` | 42 passed, 0 failed |
| Smoke (boot + routes + reload) | `npm run test:smoke` | 26 passed, 0 failed |
| Phase 3 (candidates/roadmap/coding) | `npm run test:phase3` | 19 passed, 0 failed |
| Frontend typecheck + build | `npm run build` | pass (0 errors) |
| Frontend lint | `npm run lint` (oxlint) | pass (0 issues) |

**Total: 249 backend assertions, 0 failures; frontend builds clean.**

---

## 4. Fixes Landed During Verification

*   `testGithubAnalyzer.js` — mock transport returns a Promise (analyzer calls
    `.catch()` on `ghFetch` results), fixing a first-run crash.
*   `testGithubAnalyzer.js` — `clearRepoCache()` before the rate-limit scenarios so
    cached `acme/app` results don't mask error paths.
*   `repoAnalyzer.ts` — added `STYLE_EXT` (`css`/`scss`/`sass`/`less` → `SOURCE`);
    `src/styles.css` no longer lands in `IGNORED`.
*   `testGithubAnalyzer.js` — `.gitignore` used as the `IGNORED` example; persistence
    assertions compare `githubAnalyzedAt` via `new Date(...).toISOString()` (ISO
    round-trip adds `.000`).
*   `GithubProjectPage.tsx` — removed unused `scoreColor` helper (TS6133).

---

## 5. Notes / Follow-ups

*   GitHub unauthenticated limit is ~60 req/hr — the 1h cache and the `pushed_at`
    short-circuit keep a normal session well under the cap. An OAuth token seam
    (documented in `docs/32_GitHub_Analyzer.md`) is a future enhancement.
*   Repo browsing is capped (150 files, generous fetch budget) to stay within free-tier
    memory and rate limits; large monorepos degrade to shallow profiles rather than
    failing.
*   Not committed: this phase's changes remain in the working tree alongside Phase 2/3
    work. Commit when the user is ready (Phase 15 tests / DoD are the next milestone).
