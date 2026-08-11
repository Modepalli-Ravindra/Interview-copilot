# Phase 6 Report: Realtime Voice Interview

> Status: **DONE** — `npm run test:phase6` green (106 assertions), all regression
> suites green, backend + frontend builds clean.
> Date: 2026-08-11

## 1. Scope

Phase 6 adds a realtime, transport-agnostic voice layer on top of the existing
interview engine. The browser may answer by voice (STT) or text; the backend
remains authoritative for the interview content, the voice state machine, the
question-deduplication guarantees, the voice metrics, the report provenance,
and the persisted session record.

The interview transcript stays the **single source of truth** — voice metadata
is additive (`session.voice`) and never replaces or duplicates it.

## 2. What Was Built

### 2.1 Backend services

| Piece | Where |
| :--- | :--- |
| Shared voice types + default meta | `backend/src/services/voiceTypes.ts` |
| Server-authoritative state machine | `backend/src/services/voiceStateMachine.ts` |
| Question de-duplication (semantic) | `backend/src/services/questionDedup.ts` |
| Voice metrics (server-derived, never invented) | `backend/src/services/voiceMetrics.ts` |
| Shared in-memory interview-state registry | `backend/src/services/interviewSessionRegistry.ts` |
| Shared finalizer (feedback + roadmap + persist) | `backend/src/services/interviewFinalizer.ts` |
| Engine dedup guard + mock no-repeat cursor | `backend/src/services/interviewEngine.ts` |
| REST voice routes `/api/voice/*` | `backend/src/routes/voice.ts` |
| Voice config persisted at session creation | `backend/src/routes/sessions.ts` |
| Feedback voice truth block + attachment | `backend/src/services/feedback.ts` |
| Socket.IO voice handling (STT/TTS twin) | `backend/src/handlers/interviewHandler.ts` |

### 2.2 Frontend

| Piece | Where |
| :--- | :--- |
| Persisted voice prefs + mic/synthesis probe + completion chime | `frontend/src/lib/voice.ts` |
| Voice settings widget + create payload | `frontend/src/pages/InterviewsPage.tsx` |
| Completion chime on `session_ended` | `frontend/src/pages/InterviewPage.tsx` |
| Existing STT/TTS hooks | `frontend/src/hooks/useSpeechRecognition.ts`, `useSpeechSynthesis.ts` |

## 3. Smoke Test Command

```bash
cd backend
npm run test:phase6
```

The script (`backend/scripts/smokePhase6.js`) is executed against compiled
`dist/`; the npm script runs `npm run build` first.

## 4. Test Coverage (106 assertions)

| Area | Things proved |
| :--- | :--- |
| 1. Voice session creation | `voiceEnabled`, `voiceMode`, `sttSupported`, `ttsSupported` persisted; validation rejects invalid values (`400`) |
| 2. Persistence | voice metadata survives session reload from the store |
| 3. Transcript | question → answer → follow-up → answer; transcript length + senders exact |
| 4. Semantic dedup | `"Explain your project architecture."` vs `"Can you walk me through the architecture of your project?"` detected as duplicate; engine emits a rotating deeper follow-up instead |
| 5. Exact dedup | identical question emitted again is rejected and replaced |
| 6. `questions_already_asked` | the live prompt contains the block with prior questions (asserted in the captured gateway prompt) |
| 7. Mock cycling | static pool never repeats; each answer consumes exactly one question; after exhaustion the engine rotates follow-ups |
| 8. Follow-up behavior | weak/incomplete answers produce teaching turns (live + mock) |
| 9. Voice metrics persistence | metrics attached to session/status/feedback and survive reload |
| 10. Feedback grounding | `report.voice` carries the server-computed numbers (speaking time, averages, counts) |
| 11. AI unavailable / derived | `feedbackSource === 'mock'`, provider/gateway `null`, voice still attached |
| 12. Empty metrics | `averageAnswerDurationMs === null`, zero counts, `available.* === false`; no invented keys (`confidence`, `sttConfidence`, `personality`, …) |
| 13. Transcript authority | voice metadata does not duplicate/alter the transcript; no audio in messages |
| 14. Completion | session `COMPLETED`, score + feedback persisted |
| Security | client cannot claim AI provenance; durations are clamped to 10 min; negative/NaN rejected; raw audio (base64 in answer body) is never persisted |

## 5. Deterministic / Offline Test Strategy

The suite runs fully offline with zero external dependencies:

- **Live engine path** — the gateway's `providerRouter` module is patched
  in-process with a scripted fake (`setFake`): canned deterministic completions
  including a reworded duplicate and an exact duplicate. (The facade
  `aiGateway` re-exports via getters, so the stub is installed on the
  underlying `providerRouter` whose exports are writable — the facade resolves
  lazily at call time.) This exercises the real `handleInterviewAnswer` code —
  prompt construction, semantic guard, rotating fallback — without a model.
- **Mock / derived path** — all AI providers are forced off
  (`OMNIROUTE_URL=disabled`, `OPENCODE_SERVER_URL=disabled`, empty provider
  order, `JUDGE0_URL` on a closed port). The real provider router falls back to
  its deterministic mock, and the feedback finalizer produces the derived
  report with truthful `mock` provenance.
- **No browser APIs** — no microphone, no `SpeechRecognition`, no
  `SpeechSynthesis`, no network. Everything is HTTP + engine-level assertions.
- **Deterministic assertions** — assertions check behavior (duplicate rejected,
  question differs, follow-up exists, metrics persisted, provenance correct,
  status completed) rather than fragile model wording. The fixed fallback
  sentences used when a duplicate is rejected or the mock pool is exhausted are
  asserted by literal phrases (`"go one level deeper"`, `"Solid answer"`).
- **Data safety** — `backend/data/sessions.json` is backed up and restored on
  exit.

## 6. Known Browser-Only Limitations

These are intentionally NOT exercised by the offline smoke suite (they require
real browser hardware) and remain covered only by the frontend hooks:

- Real microphone capture and `SpeechRecognition` STT output (including interim
  transcripts and the `no-speech` error path) — `useSpeechRecognition.ts`.
- `SpeechSynthesis` voice output quality and `isPlayingAudio` state —
  `useSpeechSynthesis.ts`.
- `navigator.mediaDevices.enumerateDevices()` capability probe (`lib/voice.ts`)
  — the test asserts the server-side persistence of the client-reported
  `sttSupported`/`ttsSupported` flags, not the probe itself.
- The completion chime is a WebAudio synthesis (headless-safe, but no audible
  assertion is made).
- The Socket.IO `transcript_update`/`session_ended` events are transport twins
  of the REST flow; the smoke suite drives the REST surface and the same
  engine/finalizer, so the socket path shares the identical logic.

## 7. Bugs Found & Fixed During Verification

| Bug | Fix |
| :--- | :--- |
| `/api/voice/*` was never mounted in `app.ts` → every voice route 404'd | Added `voiceRouter` mount in `backend/src/app.ts` |
| `finalizeInterview` passed raw `VoiceSessionMeta` into the feedback report, so `report.voice` lacked computed fields (`speechTurnCount`, `averageAnswerDurationMs`, `available.*`) | Finalizer now converts via `computeVoiceMetrics(session.voice, state.transcript)` before passing to feedback |
| Mock-mode question pool never advanced: teaching/solid turns don't contain the question text, so the `asked`-based detection kept returning the same question | Cursor-based `state.mockCursor` (`mockAnswer` consumes one question per answer; `mockStart` seeds it after the opening Q0). Rebuild-safe: if the state is recreated from a persisted transcript, the cursor is recovered from the answer count (`answered - 1`) |
| Exhausted mock pool + duplicate-rejection fallback reused the same fixed sentence, causing exact repeats | Rotating `DEEPER_FOLLOW_UPS` pool (`deeperFollowUp()`), used by mock fallback, live-engine guard, and socket-handler guard |
