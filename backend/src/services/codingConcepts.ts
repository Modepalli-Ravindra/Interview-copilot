/**
 * Phase 5 — Deterministic canonical-concept extraction for coding questions.
 *
 * Enables concept-level duplicate detection WITHOUT an embedding API. A
 * generated question's text is scanned against keyword rules to produce an
 * ordered set of canonical concept slugs (primary concept first). Two
 * questions whose canonical concept sets collide are treated as the same
 * underlying pattern even when the wording is completely different.
 *
 * Example:
 *   "Find two numbers whose sum is X"
 *   "Find a pair in an array matching a target"
 *   → both map to `two_sum` / `hash_map_pair_lookup`.
 */

export interface ConceptRule {
  slug: string;
  pattern: RegExp;
}

export const CONCEPT_RULES: ConceptRule[] = [
  { slug: 'two_sum', pattern: /\b(two numbers|pair .* (?:add|sum)|sum .* target|target sum|pair of .* sum)\b/i },
  { slug: 'hash_map_pair_lookup', pattern: /\b(hash ?map|hash ?table|two ?sum|pair(?:ing)?|complement|frequency map|dictionary lookup)\b/i },
  { slug: 'frequency_count', pattern: /\b(frequency|occurrence|count .*(?:char|letter|word|element)|first non-?repeating|most common|majority)\b/i },
  { slug: 'sliding_window', pattern: /\b(sliding window|subarray (?:of|with) (?:size|length)|longest substring|max.*subarray|minimum window|fixed-length window)\b/i },
  { slug: 'two_pointers', pattern: /\b(two pointers|left and right pointer|opposite ends|sorted array.*pair|container with most water|trapping rain)\b/i },
  { slug: 'binary_search', pattern: /\b(binary search|search in a sorted|find .*in a sorted|lower bound|upper bound|median of two sorted)\b/i },
  { slug: 'prefix_sum', pattern: /\b(prefix sum|running sum|cumulative sum|range sum)\b/i },
  { slug: 'sorting', pattern: /\b(sort(?:ed)?|merge two sorted|merge sort|quick sort|in-?place sort|kth (?:smallest|largest))\b/i },
  { slug: 'stack_balanced_parentheses', pattern: /\b(valid parentheses|balanced bracket|matching bracket|open bracket|closing bracket)\b/i },
  { slug: 'stack_evaluation', pattern: /\b(reverse polish|postfix|expression evaluation|infix|calculator)\b/i },
  { slug: 'stack_monotonic', pattern: /\b(next greater|next smaller|monotonic stack|daily temperatures)\b/i },
  { slug: 'queue_bfs', pattern: /\b(bfs|breadth.first|level order|nearest (?:distance|node)|shortest path in a grid|word ladder)\b/i },
  { slug: 'graph_cycle_detection', pattern: /\b(cycle in|has cycle|detect.*cycle|course schedule|prerequisite|can you finish all)\b/i },
  { slug: 'graph_topological_sort', pattern: /\b(topological|topo sort|prerequisite|task ordering|dependency order)\b/i },
  { slug: 'graph_shortest_path', pattern: /\b(shortest path|dijkstra|bellman.ford|weighted graph)\b/i },
  { slug: 'tree_depth', pattern: /\b(maximum depth|height of a tree|binary tree depth|diameter of a.*tree)\b/i },
  { slug: 'tree_traversal', pattern: /\b(tree traversal|in-?order|pre-?order|post-?order|level-?order)\b/i },
  { slug: 'linked_list_reversal', pattern: /\b(reverse a linked list|reverse the list|linked list.*reverse|iterative reverse)\b/i },
  { slug: 'linked_list_cycle', pattern: /\b(linked list.*cycle|cycle in.*list|detect cycle.*linked)\b/i },
  { slug: 'dp_fibonacci', pattern: /\b(climbing stairs|fibonacci|distinct ways|number of ways|tribonacci)\b/i },
  { slug: 'dp_subsequence', pattern: /\b(longest common sub|longest increasing|lcs|subsequence|coin change|knap?sack|edit distance|partition equal)\b/i },
  { slug: 'greedy', pattern: /\b(greedy|maximize profit|interval scheduling|minimum number of.*coins|activity selection)\b/i },
  { slug: 'recursion', pattern: /\b(recursi|backtracking|generate all|subsets?|permutations?|combinations?|n-queens|sudoku)\b/i },
  { slug: 'string_manipulation', pattern: /\b(anagram|palindrome|reverse a string|string builder|character array|sentence|word)\b/i },
  { slug: 'substring_matching', pattern: /\b(substring|needle in haystack|pattern match|regexp?|kmp)\b/i },
  { slug: 'lru_cache', pattern: /\b(lru|least recently used|cache(?:s)?(?: eviction)?|evict)\b/i },
  { slug: 'rate_limiting', pattern: /\b(rate limit|throttle|requests per second|token bucket|leaky bucket)\b/i },
  { slug: 'rest_api_design', pattern: /\b(rest api|http endpoint|resource|key-value store|restful)\b/i },
  { slug: 'authentication', pattern: /\b(jwt|auth(?:entication)?|token|session|oauth|login)\b/i },
  { slug: 'sql_join', pattern: /\b(sql join|inner join|left join|correlated subquery|join .*table)\b/i },
  { slug: 'sql_aggregation', pattern: /\b(aggregat|group by|having|sum.*per|average.*per|count.*per|highest salary per|top earner)\b/i },
  { slug: 'sql_window', pattern: /\b(window function|row_number|rank\(|partition by|lag|lead)\b/i },
  { slug: 'debounce', pattern: /\b(debounc|search input|type.*stop|settimeout.*reset|rapid typing)\b/i },
  { slug: 'async_promises', pattern: /\b(promise|async|await|call.?back|non-?blocking|race condition)\b/i },
  { slug: 'state_management', pattern: /\b(react state|usestate|redux|context|store|component state)\b/i },
  { slug: 'data_transformation', pattern: /\b(transform|map .*reduce|filter .*map|normalize data|flatten)\b/i },
  { slug: 'backend_logic', pattern: /\b(server.?side|endpoint|request handling|middleware|http handler|rest)\b/i },
];

/** Fallback concepts when nothing matches (keeps every question tagged). */
export const FALLBACK_CONCEPTS = ['core_algorithms'];

/** Normalize a raw concept token (from AI or from rules) to a canonical slug. */
export function normalizeConcept(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (!cleaned) return '';
  // Collapse common aliases to canonical slugs.
  const alias: Record<string, string> = {
    'two_sum': 'two_sum',
    'pair_sum': 'two_sum',
    'hash_map': 'hash_map_pair_lookup',
    'hash_map_pair_lookup': 'hash_map_pair_lookup',
    'hashmap': 'hash_map_pair_lookup',
    'dictionary': 'hash_map_pair_lookup',
    'hash_table': 'hash_map_pair_lookup',
    'sliding_window': 'sliding_window',
    'two_pointers': 'two_pointers',
    'two_pointer': 'two_pointers',
    'binary_search': 'binary_search',
    'prefix_sum': 'prefix_sum',
    'sorting': 'sorting',
    'merge_two_sorted': 'sorting',
    'valid_parentheses': 'stack_balanced_parentheses',
    'balanced_parentheses': 'stack_balanced_parentheses',
    'stack': 'stack_evaluation',
    'reverse_polish': 'stack_evaluation',
    'bfs': 'queue_bfs',
    'graph': 'graph_cycle_detection',
    'graph_cycle': 'graph_cycle_detection',
    'topological_sort': 'graph_topological_sort',
    'tree': 'tree_depth',
    'binary_tree': 'tree_depth',
    'linked_list': 'linked_list_reversal',
    'linked_list_reversal': 'linked_list_reversal',
    'dp': 'dp_fibonacci',
    'dynamic_programming': 'dp_fibonacci',
    'climbing_stairs': 'dp_fibonacci',
    'fibonacci': 'dp_fibonacci',
    'recursion': 'recursion',
    'backtracking': 'recursion',
    'strings': 'string_manipulation',
    'string': 'string_manipulation',
    'anagram': 'string_manipulation',
    'palindrome': 'string_manipulation',
    'lru_cache': 'lru_cache',
    'caching': 'lru_cache',
    'rate_limiting': 'rate_limiting',
    'rest_api': 'rest_api_design',
    'api': 'rest_api_design',
    'authentication': 'authentication',
    'auth': 'authentication',
    'jwt': 'authentication',
    'sql': 'sql_aggregation',
    'sql_join': 'sql_join',
    'sql_aggregation': 'sql_aggregation',
    'sql_window': 'sql_window',
    'window_function': 'sql_window',
    'debounce': 'debounce',
    'async': 'async_promises',
    'promises': 'async_promises',
    'react_state': 'state_management',
    'state_management': 'state_management',
    'data_transformation': 'data_transformation',
    'backend_logic': 'backend_logic',
  };
  return alias[cleaned] || cleaned;
}

/** Detect canonical concepts from a question title + statement. Ordered, primary first. */
export function detectConcepts(title: string, statement: string): string[] {
  const text = `${title}\n${statement}`;
  const found = new Set<string>();
  for (const rule of CONCEPT_RULES) {
    if (rule.pattern.test(text)) {
      found.add(rule.slug);
      rule.pattern.lastIndex = 0;
    }
  }
  const ordered = Array.from(found);
  if (ordered.length === 0) return [...FALLBACK_CONCEPTS];
  return ordered;
}

/** Sanitize + normalize an AI-supplied concept list. */
export function normalizeConcepts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw.slice(0, 8)) {
    if (typeof c !== 'string' && typeof c !== 'number') continue;
    const slug = normalizeConcept(String(c));
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/** Canonical signature of a concept set (sorted, deduped, joined). */
export function conceptSignature(concepts: string[]): string {
  const normalized = concepts.map(normalizeConcept).filter(Boolean);
  return [...new Set(normalized)].sort().join('|');
}

/** True when both question concept sets are exactly the same canonical pattern. */
export function isSameConceptPattern(a: string[], b: string[]): boolean {
  return conceptSignature(a) === conceptSignature(b) && a.length > 0 && b.length > 0;
}

/** True when the concept sets share at least one signature concept. */
export function sharesConcept(a: string[], b: string[]): boolean {
  const sa = new Set(a.map(normalizeConcept).filter(Boolean));
  const sb = new Set(b.map(normalizeConcept).filter(Boolean));
  let shared = 0;
  for (const c of sa) if (sb.has(c)) shared += 1;
  return shared > 0;
}

/** Strong shared-pattern overlap: the primary concept collides. */
export function sharesPrimaryConcept(a: string[], b: string[]): boolean {
  const pa = a.map(normalizeConcept).filter(Boolean)[0];
  const pb = b.map(normalizeConcept).filter(Boolean)[0];
  if (!pa || !pb) return false;
  return pa === pb;
}
