/**
 * Phase 6 — Question deduplication.
 *
 * The interviewer must never repeat an already-asked question unless
 * deliberately revisiting it for clarification. This module detects
 * duplicates beyond exact string equality: questions are normalized
 * (lowercase, punctuation stripped, stop-words dropped) and compared on
 * content-token overlap.
 *
 * Used by the interview engine (prompt guidance + mock fallback guard) and
 * directly tested by the Phase 6 smoke suite.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'with', 'about', 'your', 'you', 'my', 'me', 'how', 'what', 'why', 'when',
  'where', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'can', 'could',
  'would', 'should', 'tell', 'me', 'walk', 'through', 'go', 'over', 'explain',
  'please', 'describe', 'talk', 'this', 'that', 'from', 'it', 'its', 'have',
  'has', 'had', 'been', 'will', 'then', 'so',
]);

/** Normalize a question into content tokens for comparison. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Content tokens with stop-words removed (used for overlap scoring). */
export function contentTokens(q: string): string[] {
  return normalizeQuestion(q)
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Jaccard-style overlap between two questions' content tokens. Returns 0..1.
 * 1 means identical content; 0 means no shared content words.
 */
export function questionOverlap(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  const union = new Set([...ta, ...tb]).size;
  return shared.length / union;
}

/**
 * Whether two questions should be treated as duplicates. Uses a high overlap
 * threshold and requires the shorter question to be substantially covered.
 */
export function isSemanticDuplicate(a: string, b: string, threshold = 0.62): boolean {
  if (normalizeQuestion(a) === normalizeQuestion(b)) return true;
  if (!a.trim() || !b.trim()) return false;
  const overlap = questionOverlap(a, b);
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  const shorterCovered = Math.min(ta.length, tb.length) > 0
    ? Math.min(
        ta.filter((t) => new Set(tb).has(t)).length / Math.max(1, ta.length),
        tb.filter((t) => new Set(ta).has(t)).length / Math.max(1, tb.length),
      )
    : 0;
  return overlap >= threshold || shorterCovered >= 0.85;
}

/** Find an already-asked question semantically equal to `question`. */
export function findSemanticDuplicate(
  question: string,
  asked: string[],
  threshold = 0.62,
): string | null {
  const normalized = normalizeQuestion(question);
  for (const prior of asked) {
    if (!prior || normalizeQuestion(prior) === normalized) continue;
    if (isSemanticDuplicate(question, prior, threshold)) return prior;
  }
  return null;
}
