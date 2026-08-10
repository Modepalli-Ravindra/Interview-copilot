# Phase 5 Report: Adaptive Coding Engine

> Status: **DONE** — all backend suites and frontend checks green.
> Date: 2026-08-10

## 1. Scope

Phase 5 ships a full adaptive coding interview inside a normal `CODING_INTERVIEW`
session. A candidate runs a question-by-question interview grounded in their resume,
JD, project/GitHub analysis, and match report. Difficulty adapts deterministically
from **verified execution results only** (never from the LLM), every numerical
metric in the end-of-interview report is server-derived, and hidden test payloads
never leave the server.

The multi-question flow is wired end-to-end in the frontend: setup → question
progress → Run Tests → attempts → hints → per-question timer → Complete / Next →
final Coding Performance report with truthful LIVE / DERIVED / MOCK / UNVERIFIED
provenance.

---

## 2. What Was Built

### 2.1 Backend services

| Piece | Where |
| :--- | :--- |
| Question generation (AI/template, dedup, seed catalog) | `backend/src/services/codingEngine.ts` |
| Deterministic adaptive difficulty + pass-rate classification | `backend/src/services/codingAdaptive.ts` |
| Stored per-question records, state machine, public projections | `backend/src/services/codingStateManager.ts` |
| Hints (deterministic, 2 per question) | `backend/src/services/codingHints.ts` |
| Topic/concept catalogs + difficulty config | `backend/src/services/codingTopics.ts`, `codingConcepts.ts` |
| **Deterministic metrics + per-question report** | `backend/src/services/codingMetrics.ts` |
| Interview-state JSON persistence | `backend/data/coding-interviews.json` |
| Report generation (AI + derived) with coding overlay | `backend/src/services/feedback.ts` |

### 2.2 API surface

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/coding-interview/start` | Create/resume an interview, ask Q1 (returns `resumed: true` on reload) |
| `GET  /api/coding-interview/status/:sessionId` | Resume-safe status + active question (public projection only) |
| `POST /api/coding-interview/:id/questions/:qid/hint` | Deterministic next hint (slot 1/2, max 2) |
| `POST /api/coding-interview/:id/questions/:qid/submit` | Record a verified attempt against a question |
| `POST /api/execute` (+ `coding_interview_session_id`/`question_id`) | Run code — hidden tests resolved server-side, attempt auto-recorded |
| `POST /api/coding-interview/:id/complete` | Finalize active question, adapt difficulty, return signal/decision |
| `POST /api/coding-interview/:id/next` | Ask next adaptive question (`force=true` skips the active one) |
| `POST /api/coding-interview/:id/cancel` | End early (status remains readable) |
| `POST /api/coding-interview/:id/feedback` | Auto-complete, build metrics report, generate + persist AI/derived feedback |

### 2.3 Persistence

No schema migration was required — interview state lives in
`backend/data/coding-interviews.json` keyed by `sessionId`, while the session row
(`backend/data/sessions.json`) stores the finalized `status`, `score`, and `feedback`
exactly like any other completed session, so completed coding interviews appear in
the interviews list / history with their score and provenance badge.

---

## 3. Deterministic Metrics Implementation (`codingMetrics.ts`)

Everything is derived from stored execution truth:

* **Reference attempt** — `referenceAttempt(q)` returns the **last verified
  (non-mock) attempt** when one exists, otherwise the most recent recorded attempt.
  A verified result is never hidden behind a later offline fallback run.
* **Per-question signal** — `analyzeQuestion(q)` (`codingAdaptive.ts`) computes the
  pass rate from the reference attempt and classifies `STRONG / STABLE /
  NEEDS_IMPROVEMENT`. A question with **no verified test evidence** (unattempted or
  mock-only) is `UNRELIABLE` and flagged `fromMock: true`, so it can never count
  toward verified performance or the score.
* **Overall score** (`computeOverallScore`):
  - 60% pass rate (`totalTestsPassed / totalTests`)
  - 30% completion rate (`solved / attempted`)
  - 10% efficiency (100 − extra attempts − hint usage − slow solves)
  - Degrades to a neutral 50 when no test results exist — never inflated.
* **Report** (`buildCodingInterviewReport`) — metrics + per-question breakdown +
  `verifiedQuestionCount` / `mockQuestionCount` / `hasVerifiedExecution`.

Adaptive difficulty (`decideNextDifficulty`) only moves on verified signals;
mock/unreliable completions keep the difficulty unchanged and reset streaks.

---

## 4. Feedback Integration + Provenance

The `/feedback` route passes the server-computed `CodingInterviewReport` into
`generateFeedback`. `applyCodingInterviewDerived` overlays the deterministic numbers
onto **both** derived and live-AI reports:

* `report.score` is always **overwritten** with `metrics.overallScore`.
* A single `Coding` dimension (server value) replaces any AI/derived Coding
  dimension (deduplicated) — the AI narrative is preserved for the other dimensions.
* `verifiedQuestionCount` / `mockQuestionCount` / per-question `[UNVERIFIED]` markers
  keep execution provenance honest.

Provenance labels are explicit and truthful:

| `feedbackSource` | Meaning | UI label |
| :--- | :--- | :--- |
| `ai` | Live model generated the narrative; coding score/metrics still server-derived | AI-generated report |
| `fallback` | AI unreachable/invalid JSON — deterministic derived report | Derived report (AI output unavailable) |
| `mock` | No AI provider configured | Offline report (no AI provider) |

The overall score card is additionally captioned **"server-derived"**, and an
**UNVERIFIED** badge appears whenever `hasVerifiedExecution` is false, so the UI can
never claim a pass the judge didn't see.

---

## 5. Hidden-Test Security

* `toPublicQuestion` never serializes `hiddenTestCases` — only `hiddenTestCount` and
  the visible test cases are exposed.
* `/api/execute` resolves hidden tests from **server state only** for coding-interview
  runs; a client-supplied `hidden_test_cases` payload is ignored (verified by smoke).
* The feedback prompt explicitly forbids referencing hidden test case contents.

---

## 6. Frontend Flow (`CodingInterviewPage.tsx`, `CodeWorkspace.tsx`)

1. **Setup** — role, company, resume/JD text, skills, question count (3/5/7),
   starting difficulty, or paste a session id to **resume**.
2. **Question progress** — chip per question with topic, difficulty, pass state,
   `(template)` marker for mock-sourced questions.
3. **Question panel** — statement, constraints, examples, difficulty, hidden-test
   count, attempt count, deterministic **hints** (2 max), **Complete & Next**.
4. **Workspace** — language selector, **Run Tests**, live Judge0 output with
   visible+hidden split and `offline fallback` badge.
5. **Per-question timer** — a live `QuestionTimer` chip anchored to the
   server-stamped `startedAt`, so it survives a refresh and resets on each question.
6. **Report modal** — overall score (server-derived), tests passed / solved / avg
   attempts, hidden-test bar, per-question breakdown with classification and
   `[UNVERIFIED]` markers, mastered / practice topics, tips, and provenance badges.

### 5.x Note on refresh/resume

`GET /status` and a repeated `POST /start` return the **same active question** with
attempts intact (`resumed: true`), because state persists server-side per session.
Both are covered by the metrics smoke test.

---

## 7. Tests

| Suite | Command | Result |
| :--- | :--- | :--- |
| Phase 5 adaptive flow | `npm run test:phase5` | 29/29 PASS |
| Phase 5 metrics + feedback + resume + LIVE provenance | `npm run test:phase5metrics` | 37/37 PASS |
| Phase 3 regression | `npm run test:phase3` | PASS |
| Intelligence / resume-JD / GitHub | `test:intelligence`, `test:resumejd`, `test:github` | PASS |
| Backend type-check | `npm run build` | PASS |
| Frontend lint + build | `npm run lint` + `npm run build` | PASS |

### 7.1 What the metrics smoke asserts (highlights)

* Hidden tests are resolved server-side (a spoofed 99-case client payload is
  ignored; the reported count matches the server's `hiddenTestCount`).
* The reference attempt is the last verified result, never a later offline "all-pass".
* `verifiedQuestionCount`/`mockQuestionCount` are correct (unattempted questions
  count as unverified, not verified).
* `report.score` equals `metrics.overallScore` and is persisted on the session.
* Repeat `/feedback` calls are idempotent (200).
* `/start` after a reload returns `resumed: true` with the same question and intact
  attempts.
* `applyCodingInterviewDerived` (LIVE path) overrides an AI report's score, dedupes
  the Coding dimension to the server value, and preserves non-coding dimensions.

---

## 8. Known Limitations

* **`/submit` trusts the client** — it records an attempt as `verified` when the
  caller passes `fromMock: false`. The primary verified path is `/api/execute`,
  which is server-verified through Judge0; `/submit` exists for offline/edge
  recovery. A malicious caller could fabricate a "verified" attempt via `/submit`.
  Mitigation is out of scope for the free-tier stack (would require signed judge
  tokens).
* **Offline sandbox** — when Judge0 is unreachable the workspace falls back to a
  deterministic mock (`fromMock: true`). All such results are flagged UNVERIFIED and
  never contribute pass-rate-derived conclusions.
* **Code editor** — a native textarea stands in for a full Monaco/CodeMirror editor;
  syntax highlighting, autocomplete, and line numbers are not included.
* **Question generation** — requires a reachable AI provider for truly novel
  questions; otherwise the deterministic template catalog is used (marked
  `fromMock`).
