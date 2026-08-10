/**
 * Phase 5 — Deterministic hint system for coding interviews.
 *
 * Max 2 hints per question:
 *   hint #1 — conceptual direction (what to think about)
 *   hint #2 — stronger implementation guidance (how to structure it)
 *
 * Hints never reveal a complete solution. They are generated
 * deterministically from the question's topic + concepts (AI is not required),
 * so free providers are not consumed on every hint request.
 */

import type { CodingDifficulty } from './codingTypes';

export const HINTS_PER_QUESTION = 2;

export interface CodingHint {
  hintNumber: number;
  level: 1 | 2;
  text: string;
}

interface HintBankEntry {
  concepts?: string[];
  hints: [string, string];
}

const TOPIC_HINTS: Record<string, HintBankEntry> = {
  arrays: {
    hints: [
      'Think about how you can track information while scanning the array once, rather than re-scanning for every element.',
      'Consider maintaining running values or indices as you iterate; often an extra variable or a map avoids an O(n^2) scan.',
    ],
  },
  strings: {
    hints: [
      'Break the string down into pieces (characters, words, tokens) and think about what state you need to remember between pieces.',
      'Work with the string as an array when you can; be careful with edge cases like empty strings, whitespace, and case.',
    ],
  },
  'hash maps': {
    hints: [
      'Ask yourself: can I answer the question for each element in O(1) if I had already seen the earlier elements?',
      'A hash map keyed by the value (or a computed property) lets you check a condition for the current item against all previous items at once.',
    ],
  },
  sorting: {
    hints: [
      'Think about what invariant sorting establishes, and whether the answer falls out of the sorted order.',
      'Start by sorting the input, then decide whether you need to scan from both ends or track adjacent pairs.',
    ],
  },
  searching: {
    hints: [
      'If the data has any monotonic property, a search can usually be narrowed by half at each step.',
      'Confirm whether the input is sorted; if it is, compare against the middle element and eliminate one half.',
    ],
  },
  'linked lists': {
    hints: [
      'Draw the list. Most linked-list problems become easy once you track two or three pointers at once.',
      'Iterate with a "previous" pointer alongside the current one, or use slow/fast pointers for cycle or middle detection.',
    ],
  },
  stacks: {
    hints: [
      'A stack is the natural structure when the answer depends on matching the most recent "open" thing first (LIFO).',
      'Push markers onto the stack and pop when the closing counterpart appears; also consider storing indices instead of values.',
    ],
  },
  queues: {
    hints: [
      'A queue (FIFO) is natural for processing things in the order they arrive, or exploring layer by layer.',
      'For shortest-path or level-order problems, a queue with a visited set avoids re-processing nodes.',
    ],
  },
  graphs: {
    hints: [
      'Model the problem as nodes and edges, then ask: do I need to find paths, cycles, or an ordering?',
      'Choose between DFS (recursion/stack) and BFS (queue); add a visited set to avoid revisiting nodes.',
    ],
  },
  recursion: {
    hints: [
      'Define the recursive step first: what is the answer for a smaller input, and how does it combine into the full answer?',
      'Always specify a base case, then verify the recursion terminates and avoids duplicated work.',
    ],
  },
  'dynamic programming': {
    hints: [
      'Look for overlapping subproblems: can the answer for a smaller n be reused to build the answer for n?',
      'Start from the base case and fill a table bottom-up (or memoize top-down), deciding at each step which transition applies.',
    ],
  },
  sql: {
    hints: [
      'Write the query in stages: select the rows you need first, then group/aggregate, then filter with HAVING if needed.',
      'If you need "the top per group", a window function (ROW_NUMBER / RANK over PARTITION BY) is often the cleanest path.',
    ],
  },
  'practical programming': {
    hints: [
      'Think about the real-world input the program will receive and what a robust program must guard against.',
      'Structure the solution as clear steps: read input, validate, process, format output exactly as expected.',
    ],
  },
  debugging: {
    hints: [
      'Trace the logic by hand on a small input where the expected answer is obvious; the bug is usually at the boundary.',
      'Check off-by-one conditions, loop termination, and assumptions about input formats before looking deeper.',
    ],
  },
  backend: {
    hints: [
      'Think about the request lifecycle: validate input, define clear status codes, and keep the data layer simple.',
      'Consider failure modes: what should the API return when a key is missing, input is invalid, or a limit is exceeded?',
    ],
  },
  frontend: {
    hints: [
      'Think about when state changes and what must be cleaned up between changes (timers, stale requests).',
      'Keep the component logic minimal: one source of truth for the state, and derive the UI from it.',
    ],
  },
  trees: {
    hints: [
      'Recursive descent on the tree is usually the shortest path; decide whether the answer needs child results or just depth.',
      'For level-order behaviour use a queue; for path problems think about what the subtree returns to its parent.',
    ],
  },
  api: {
    hints: [
      'Define the resources and the HTTP verbs first, then the status codes and error shapes.',
      'Keep operations O(1) per request where possible and think about limits and edge inputs.',
    ],
  },
};

const CONCEPT_HINTS: Record<string, HintBankEntry> = {
  two_sum: { hints: ['For each element, compute the value that would complete the pair and look it up.', 'Store value -> index in a hash map as you iterate; return the stored index and the current one.'] },
  hash_map_pair_lookup: { hints: ['Each element has exactly one "complement" that satisfies the condition.', 'Build a map from the property you need to check, then look it up while iterating.'] },
  sliding_window: { hints: ['As the window slides, most elements are reused — update the window "cost" in O(1).', 'Track a start index and grow the right edge; shrink the left edge when the window becomes invalid.'] },
  two_pointers: { hints: ['With sorted data, two pointers can find pairs/triplets in O(n) by moving the pointer that overshoots.', 'Move the smaller side inward when you need a larger sum, the larger side when you need smaller.'] },
  binary_search: { hints: ['The search space is monotonic — decide which half to discard by comparing to the middle.', 'Be careful with the boundary: use inclusive low/exclusive high and test with the smallest input.'] },
  prefix_sum: { hints: ['A running sum lets you answer any subarray sum in O(1).', 'Store the prefix sums seen so far to answer "subarray ending here sums to target" in O(1).'] },
  stack_balanced_parentheses: { hints: ['Push open brackets; every close bracket must match the top of the stack.', 'An empty stack at the end and a matching pop for every close is the whole check.'] },
  stack_evaluation: { hints: ['Operands go on the stack; when an operator arrives, pop two operands and push the result.', 'Keep a stack of numbers and evaluate left-to-right — division truncation rules matter.'] },
  queue_bfs: { hints: ['Explore layer by layer: everything at distance k is processed before distance k+1.', 'Use a queue and mark nodes visited when they are enqueued to avoid duplicates.'] },
  graph_cycle_detection: { hints: ['A DFS with a "visiting" state catches back-edges that indicate a cycle.', 'Or use Kahn\u2019s algorithm: repeatedly remove nodes with zero remaining prerequisites.'] },
  graph_topological_sort: { hints: ['An ordering exists iff there is no cycle — Kahn\u2019s algorithm gives one directly.', 'Track in-degree counts and a queue of nodes ready to process.'] },
  linked_list_reversal: { hints: ['Reverse the links while walking the list: keep next, point current back to prev, advance.', 'The new head is the last node you reach — the node whose next became null.'] },
  dp_fibonacci: { hints: ['The number of ways to reach step n is ways(n-1) + ways(n-2).', 'Compute iteratively with two rolling variables instead of recursion to avoid recomputation.'] },
  dp_subsequence: { hints: ['Build the answer from smaller prefixes — compare the current characters to extend the table.', 'A 2D table where dp[i][j] is the answer for prefixes of length i and j works for most subsequence problems.'] },
  recursion: { hints: ['Solve the smaller version of the problem and combine; trust the recursive call.', 'Base cases first, then the recursive case — verify against a tiny example by hand.'] },
  string_manipulation: { hints: ['Count characters or normalize input (lowercase, strip punctuation) before comparing.', 'Process character by character and keep the pieces you need in order.'] },
  sql_aggregation: { hints: ['Group by the dimension you want per row, then apply the aggregate.', 'Use HAVING to filter after aggregation; window functions when you need ranks per group.'] },
  rate_limiting: { hints: ['Think of a fixed window or sliding window of timestamps per client.', 'Store the timestamp of each request (or a counter) and reject when the window is full.'] },
  rest_api_design: { hints: ['Pick clear resources and verbs: PUT for create/replace, GET for read, DELETE to remove.', 'Return meaningful status codes and JSON error bodies for every failure path.'] },
  authentication: { hints: ['A token is a signed payload: verify its signature and expiry on every request.', 'Keep the secret server-side and store only the minimum needed in the token.'] },
  debounce: { hints: ['Every keystroke resets a timer; only after the timer fires do you call the callback.', 'Clear the previous timer at the start of the handler and cancel stale requests when a new one starts.'] },
  async_promises: { hints: ['Identify which operations are async and where ordering between them matters.', 'Use await sequentially when order matters, Promise.all when tasks are independent.'] },
};

export interface HintRequest {
  topic: string;
  concepts: string[];
  difficulty: CodingDifficulty;
}

/** The hint text for a given hint slot (1 or 2). Deterministic. */
export function buildHint(request: HintRequest, slot: 1 | 2): CodingHint {
  const entry = request.concepts
    .map((c) => CONCEPT_HINTS[c])
    .find((e) => e && e.hints[slot - 1]);
  const topicEntry = TOPIC_HINTS[request.topic];
  const text =
    (entry && entry.hints[slot - 1]) ||
    (topicEntry && topicEntry.hints[slot - 1]) ||
    (slot === 1
      ? 'Break the problem into smaller steps and think about what data you need to remember between those steps.'
      : 'Sketch the main loop or structure first, then handle edge cases: empty input, single elements, and boundaries.');

  const prefix = slot === 1 ? 'Think about the core idea before coding.' : 'Implementation guidance:';
  return { hintNumber: slot, level: slot, text: `${prefix} ${text}` };
}

/** Total hints available for a question (capped at the maximum). */
export function hintsAvailable(): number {
  return HINTS_PER_QUESTION;
}
