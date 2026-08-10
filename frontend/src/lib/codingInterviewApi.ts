/**
 * Phase 5 — Adaptive coding interview API client (REST-driven).
 *
 * All hidden test payloads stay server-side; these calls only exchange the
 * public projections.
 */
import { apiFetch } from './api';
import type {
  CodingInterviewReport,
  CodingInterviewStatus,
  InterviewDifficulty,
  PublicCodingQuestion,
  FeedbackReport,
} from '../types';

export interface StartCodingInterviewInput {
  sessionId: string;
  questionCount?: number;
  startDifficulty?: InterviewDifficulty;
  language?: string;
}

export interface CodingInterviewStatusResponse {
  status: CodingInterviewStatus | null;
  question: PublicCodingQuestion | null;
  active: boolean;
}

export async function startCodingInterview(input: StartCodingInterviewInput): Promise<{
  status: CodingInterviewStatus;
  question: PublicCodingQuestion | null;
  finished: boolean;
  resumed?: boolean;
}> {
  const res = await apiFetch('/api/coding-interview/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Failed to start the coding interview');
  }
  return json.data;
}

export async function getCodingInterviewStatus(sessionId: string): Promise<CodingInterviewStatusResponse> {
  const res = await apiFetch(`/api/coding-interview/status/${encodeURIComponent(sessionId)}`);
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to load the coding interview status');
  }
  return json.data as CodingInterviewStatusResponse;
}

export async function requestCodingHint(sessionId: string, questionId: string, slot?: 1 | 2): Promise<{
  hint: string;
  hintsUsed: number;
  hintsAvailable: number;
}> {
  const res = await apiFetch(
    `/api/coding-interview/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/hint`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot }) },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to request a hint');
  }
  return json.data;
}

export async function completeCodingQuestion(sessionId: string): Promise<{
  status: CodingInterviewStatus;
  message: string;
  decision: { difficulty: InterviewDifficulty; direction: string; reason: string };
  signal: { classification: string; passRate: number | null };
  finished: boolean;
}> {
  const res = await apiFetch(
    `/api/coding-interview/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to complete the question');
  }
  return json.data;
}

export async function nextCodingQuestion(sessionId: string, language?: string, force = false): Promise<{
  status: CodingInterviewStatus;
  question: PublicCodingQuestion | null;
  finished: boolean;
}> {
  const res = await apiFetch(
    `/api/coding-interview/${encodeURIComponent(sessionId)}/next`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language, force }) },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to load the next question');
  }
  return json.data;
}

export async function cancelCodingInterview(sessionId: string): Promise<CodingInterviewStatus> {
  const res = await apiFetch(
    `/api/coding-interview/${encodeURIComponent(sessionId)}/cancel`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to cancel the coding interview');
  }
  return json.data.status;
}

export async function getCodingInterviewFeedback(sessionId: string): Promise<{
  report: FeedbackReport;
  codingInterview: CodingInterviewReport;
  finished: boolean;
}> {
  const res = await apiFetch(
    `/api/coding-interview/${encodeURIComponent(sessionId)}/feedback`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to generate the coding interview feedback');
  }
  return json.data;
}
