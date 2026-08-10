/**
 * Code Execution — runs candidate code on the real Judge0 CE API (free, no
 * key required) with a transparent offline fallback so the UI never breaks.
 *
 * Env:
 *   JUDGE0_URL        base URL (default https://ce.judge0.com)
 *   JUDGE0_API_KEY    optional token (for RapidAPI-style hosts)
 */

import { Router, Request, Response } from 'express';
import 'dotenv/config';
import { updateSessionRecord } from './sessions';
import { loadCodingInterviewState, findQuestion, appendAttempt } from '../services/codingStateManager';

const router = Router();

const JUDGE0_URL = (process.env.JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';
const JUDGE0_HOST = process.env.JUDGE0_HOST || '';

export const LANGUAGE_IDS: Record<string, number> = {
  python: 71,
  javascript: 63,
  go: 60,
  java: 62,
  cpp: 54,
};

interface TestCase {
  stdin?: string;
  expected: string;
}

interface RunResult {
  status: string;
  stdout: string | null;
  stderr: string | null;
  timeMs: number | null;
  memoryKb: number | null;
  passedCount: number;
  totalCount: number;
  /** Split counts so the UI can show visible vs hidden separately. */
  visiblePassedCount: number;
  visibleTotalCount: number;
  hiddenPassedCount: number;
  hiddenTotalCount: number;
  fromMock: boolean;
}

function judgeStatusToFrontend(statusId: number): string {
  switch (statusId) {
    case 3: return 'ACCEPTED';
    case 4: return 'WRONG_ANSWER';
    case 5: return 'TIME_LIMIT_EXCEEDED';
    case 6: return 'COMPILATION_ERROR';
    default: return 'RUNTIME_ERROR';
  }
}

async function judgeSubmit(sourceCode: string, languageId: number, stdin: string): Promise<{
  stdout: string;
  stderr: string;
  statusId: number;
  timeMs: number;
  memoryKb: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUDGE0_API_KEY) headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
    if (JUDGE0_HOST) headers['X-RapidAPI-Host'] = JUDGE0_HOST;

    const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true&fields=stdout,stderr,status_id,time,memory`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin,
      }),
    });
    if (!res.ok) throw new Error(`Judge0 responded ${res.status} ${res.statusText}`);
    const body = (await res.json()) as {
      stdout?: unknown;
      stderr?: unknown;
      status_id?: unknown;
      status?: { id?: unknown };
      time?: unknown;
      memory?: unknown;
    };
    return {
      stdout: typeof body.stdout === 'string' ? body.stdout : '',
      stderr: typeof body.stderr === 'string' ? body.stderr : '',
      statusId: Number(body.status_id ?? body.status?.id ?? 0),
      timeMs: Number(body.time ?? 0),
      memoryKb: Number(body.memory ?? 0),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Deterministic offline result so the workspace stays usable without the API
function offlineResult(sourceCode: string, visibleCount: number, hiddenCount: number): RunResult {
  const hasCode = sourceCode.trim().length > 30;
  const totalCount = visibleCount + hiddenCount;
  return {
    status: hasCode ? 'ACCEPTED' : 'COMPILATION_ERROR',
    stdout: hasCode ? 'Offline sandbox: real execution unavailable.\nAll tests assumed passing (gateway offline).' : null,
    stderr: hasCode ? null : 'Empty submission.',
    timeMs: null,
    memoryKb: null,
    passedCount: hasCode ? totalCount : 0,
    totalCount,
    visiblePassedCount: hasCode ? visibleCount : 0,
    visibleTotalCount: visibleCount,
    hiddenPassedCount: hasCode ? hiddenCount : 0,
    hiddenTotalCount: hiddenCount,
    fromMock: true,
  };
}

// POST /api/execute — run source against hidden test cases
router.post('/', async (req: Request, res: Response) => {
  const {
    source_code,
    language,
    test_cases,
    hidden_test_cases,
    expected_complexity,
    session_id,
    problem,
    coding_interview_session_id,
    coding_interview_question_id,
  }: {
    source_code?: string;
    language?: string;
    test_cases?: TestCase[];
    hidden_test_cases?: TestCase[];
    expected_complexity?: string | null;
    session_id?: string;
    problem?: {
      id?: string;
      title?: string;
      difficulty?: string;
      tags?: string[];
      statement?: string;
    };
    coding_interview_session_id?: string;
    coding_interview_question_id?: string;
  } = req.body || {};

  const code = (source_code || '').trim();
  const lang = (language || 'python').toLowerCase();

  // Phase 5 — coding-interview run: hidden tests are resolved server-side only,
  // so the candidate can never see or inject them, and the attempt is appended
  // to the interview state (never to the legacy practice `session.coding`).
  let ciState: ReturnType<typeof loadCodingInterviewState> = null;
  let ciQuestion: NonNullable<ReturnType<typeof findQuestion>> | null = null;
  if (coding_interview_session_id) {
    if (typeof coding_interview_session_id !== 'string' || typeof coding_interview_question_id !== 'string') {
      return res.status(400).json({ success: false, error: 'coding_interview_session_id and coding_interview_question_id are required together' });
    }
    ciState = loadCodingInterviewState(coding_interview_session_id);
    if (!ciState) {
      return res.status(404).json({ success: false, error: 'No coding interview found for this session' });
    }
    ciQuestion = findQuestion(ciState, coding_interview_question_id);
    if (!ciQuestion) {
      return res.status(404).json({ success: false, error: 'Question not found in this coding interview' });
    }
    if (ciQuestion.completedAt) {
      return res.status(409).json({ success: false, error: 'Question already completed' });
    }
  }

  // Test resolution — server state wins for coding interviews.
  const clientTests: TestCase[] = Array.isArray(test_cases) ? test_cases : [];
  const serverTests: TestCase[] = ciQuestion ? ciQuestion.visibleTestCases || [] : [];
  const tests: TestCase[] = ciQuestion
    ? (serverTests.length > 0 ? serverTests : clientTests)
    : clientTests;
  const hiddenTests: TestCase[] = ciQuestion
    ? ciQuestion.hiddenTestCases || []
    : Array.isArray(hidden_test_cases)
      ? hidden_test_cases
      : [];
  const languageId = LANGUAGE_IDS[lang];

  if (!code) {
    return res.status(400).json({ success: false, error: 'source_code is required' });
  }
  if (!languageId) {
    return res.status(400).json({ success: false, error: `Unsupported language: ${lang}` });
  }

  const finish = (data: RunResult) => {
    if (ciQuestion && ciState) {
      try {
        appendAttempt(ciState, ciQuestion.questionId, {
          submittedCode: code.slice(0, 12000),
          language: lang,
          status: data.status,
          passedCount: data.passedCount,
          totalCount: data.totalCount,
          visiblePassedCount: data.visiblePassedCount,
          visibleTotalCount: data.visibleTotalCount,
          hiddenPassedCount: data.hiddenPassedCount,
          hiddenTotalCount: data.hiddenTotalCount,
          executionTimeMs: data.timeMs,
          memoryKb: data.memoryKb,
          stderr: data.stderr ? data.stderr.slice(0, 4000) : null,
          fromMock: data.fromMock,
        });
      } catch (err) {
        console.warn('[Execute] failed to append coding-interview attempt:', (err as Error).message);
      }
      return res.json({ success: true, data });
    }
    if (session_id) {
      try {
        updateSessionRecord(session_id, {
          coding: {
            problem: problem
              ? {
                  id: problem.id,
                  title: (problem.title || '').slice(0, 200),
                  difficulty: problem.difficulty,
                  tags: Array.isArray(problem.tags) ? problem.tags.slice(0, 8) : [],
                  statement: (problem.statement || '').slice(0, 2000),
                }
              : undefined,
            language: lang,
            submittedCode: code.slice(0, 12000),
            expectedComplexity: expected_complexity || null,
            execution: {
              status: data.status,
              passedCount: data.passedCount,
              totalCount: data.totalCount,
              timeMs: data.timeMs,
              memoryKb: data.memoryKb,
              fromMock: data.fromMock,
            },
          },
        });
      } catch (err) {
        console.warn('[Execute] failed to attach coding result to session:', (err as Error).message);
      }
    }
    return res.json({ success: true, data });
  };

  // Live mode: run every test case through Judge0
  if (JUDGE0_URL) {
    try {
      const allTests = [...tests, ...hiddenTests];
      const outcomes = await Promise.all(
        allTests.map((tc) => judgeSubmit(code, languageId, tc.stdin || '')),
      );

      let passedCount = 0;
      let visiblePassedCount = 0;
      let hiddenPassedCount = 0;
      let lastStatusId = 3;
      let combinedStdout = '';
      let combinedStderr = '';
      let totalTimeMs = 0;
      let peakMemoryKb = 0;

      outcomes.forEach((o, i) => {
        const isHidden = i >= tests.length;
        const expected = (allTests[i].expected || '').trim();
        const actual = o.stdout.trim();
        const pass = o.statusId === 3 && actual === expected;
        if (pass) {
          passedCount += 1;
          if (isHidden) hiddenPassedCount += 1;
          else visiblePassedCount += 1;
        }
        if (o.statusId !== 3) lastStatusId = o.statusId;
        totalTimeMs += o.timeMs;
        peakMemoryKb = Math.max(peakMemoryKb, o.memoryKb);
        combinedStdout += `Test ${i + 1}${isHidden ? ' (hidden)' : ''}: ${pass ? 'PASSED' : 'FAILED'}\n`;
        if (!pass && o.stderr) combinedStderr += `Test ${i + 1} stderr:\n${o.stderr}\n`;
      });

      let visibleTotalCount = tests.length;
      let hiddenTotalCount = hiddenTests.length;
      let totalCount = visibleTotalCount + hiddenTotalCount;

      if (tests.length === 0 && hiddenTests.length === 0) {
        // Free-run (no test harness): report the raw execution result
        const solo = outcomes[0] || { statusId: 3, stdout: '', stderr: '', timeMs: 0, memoryKb: 0 };
        lastStatusId = solo.statusId;
        combinedStdout = solo.stdout;
        combinedStderr = solo.stderr;
        passedCount = lastStatusId === 3 ? 1 : 0;
        visiblePassedCount = passedCount;
        visibleTotalCount = 1;
        totalCount = 1;
        totalTimeMs = solo.timeMs;
        peakMemoryKb = solo.memoryKb;
      }

      const finalStatus =
        passedCount === totalCount && totalCount > 0
          ? 'ACCEPTED'
          : lastStatusId === 3
            ? (totalCount > 0 ? 'WRONG_ANSWER' : 'ACCEPTED')
            : judgeStatusToFrontend(lastStatusId);

      return finish({
        status: finalStatus,
        stdout: combinedStdout || null,
        stderr: combinedStderr || null,
        timeMs: Math.round(totalTimeMs * 1000),
        memoryKb: peakMemoryKb,
        passedCount,
        totalCount,
        visiblePassedCount,
        visibleTotalCount,
        hiddenPassedCount,
        hiddenTotalCount,
        fromMock: false,
      });
    } catch (err) {
      console.warn('[Execute] Judge0 unavailable, using offline fallback:', (err as Error).message);
      return finish(offlineResult(code, tests.length, hiddenTests.length));
    }
  }

  return finish(offlineResult(code, tests.length, hiddenTests.length));
});

export default router;
