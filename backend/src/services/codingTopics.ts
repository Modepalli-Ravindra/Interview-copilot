/**
 * Phase 5 — Deterministic topic selection for adaptive coding interviews.
 *
 * Candidate topics are derived from real context (JD skills, resume skills,
 * GitHub technology profile, project architecture) and from the candidate's
 * previous performance (failed concepts get priority practice). When strong
 * context exists the engine never randomly picks unrelated topics.
 *
 * Only *executable* topics are returned so every generated question can be
 * verified through Judge0 (design-style topics such as api/frontend/trees
 * have no stdin/stdout harness and would produce unreliable signals).
 */

export const EXECUTABLE_TOPICS = [
  'arrays', 'strings', 'hash maps', 'sorting', 'searching', 'linked lists',
  'stacks', 'queues', 'graphs', 'recursion', 'dynamic programming',
  'sql', 'practical programming', 'debugging', 'backend',
];

const NON_EXECUTABLE = new Set(['api', 'frontend', 'trees']);

const SKILL_TOPIC_RULES: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /sql|postgres|postgresql|mysql|supabase|prisma|database|redis|mongodb/i, topic: 'sql' },
  { pattern: /react|redux|next|vue|angular|frontend|front-end|css|tailwind/i, topic: 'frontend' },
  { pattern: /node|express|backend|back-end|rest api|api|graphql|microservice|server/i, topic: 'backend' },
  { pattern: /graph|neo4j|\bbfs\b|\bdfs\b|topolog/i, topic: 'graphs' },
  { pattern: /bst|binary search tree|\btree\b/i, topic: 'trees' },
  { pattern: /\bstack\b/i, topic: 'stacks' },
  { pattern: /\bqueue\b/i, topic: 'queues' },
  { pattern: /linked\s*list/i, topic: 'linked lists' },
  { pattern: /sort|merge/i, topic: 'sorting' },
  { pattern: /binary search|searching/i, topic: 'searching' },
  { pattern: /hash\s*map|hash\s*table|dictionary|\bmap\b/i, topic: 'hash maps' },
  { pattern: /dynamic programming|knap|dp\b/i, topic: 'dynamic programming' },
  { pattern: /recurs/i, topic: 'recursion' },
  { pattern: /array/i, topic: 'arrays' },
  { pattern: /string|parsing|json|regex/i, topic: 'strings' },
  { pattern: /debug|bug|testing|quality/i, topic: 'debugging' },
  { pattern: /algorithm|data structure/i, topic: 'arrays' },
];

/** Map a single skill/technology token to a candidate topic ('' when unknown). */
export function skillToTopic(skill: string): string {
  for (const rule of SKILL_TOPIC_RULES) {
    if (rule.pattern.test(skill)) return rule.topic;
  }
  return '';
}

/** Concept slug -> topic that a follow-up question should practice. */
const CONCEPT_TOPIC_MAP: Record<string, string> = {
  two_sum: 'hash maps',
  hash_map_pair_lookup: 'hash maps',
  frequency_count: 'hash maps',
  sliding_window: 'arrays',
  two_pointers: 'arrays',
  binary_search: 'searching',
  prefix_sum: 'arrays',
  sorting: 'sorting',
  stack_balanced_parentheses: 'stacks',
  stack_evaluation: 'stacks',
  stack_monotonic: 'stacks',
  queue_bfs: 'queues',
  graph_cycle_detection: 'graphs',
  graph_topological_sort: 'graphs',
  graph_shortest_path: 'graphs',
  tree_depth: 'trees',
  tree_traversal: 'trees',
  linked_list_reversal: 'linked lists',
  linked_list_cycle: 'linked lists',
  dp_fibonacci: 'dynamic programming',
  dp_subsequence: 'dynamic programming',
  greedy: 'dynamic programming',
  recursion: 'recursion',
  string_manipulation: 'strings',
  substring_matching: 'strings',
  lru_cache: 'hash maps',
  rate_limiting: 'backend',
  rest_api_design: 'backend',
  authentication: 'backend',
  sql_join: 'sql',
  sql_aggregation: 'sql',
  sql_window: 'sql',
  debounce: 'frontend',
  async_promises: 'backend',
  state_management: 'frontend',
  data_transformation: 'strings',
  backend_logic: 'backend',
  core_algorithms: 'arrays',
};

/** Map a canonical concept slug to a runnable topic. */
export function conceptToTopic(concept: string): string {
  return CONCEPT_TOPIC_MAP[concept] || '';
}

export interface TopicSelectionInput {
  jdRequiredSkills: string[];
  jdPreferredSkills: string[];
  resumeSkills: string[];
  /** GitHub / project technology tokens (languages, frameworks, libraries). */
  githubTechnologies: string[];
  /** GitHub / project architecture pattern tokens. */
  githubArchitecture: string[];
  /** Canonical concepts the candidate failed on previous questions. */
  failedConcepts: string[];
  /** Canonical concepts the candidate has mastered. */
  masteredConcepts: string[];
  /** Topics already used earlier in this session (avoid immediate repeats). */
  usedTopics: string[];
  /** Seed for the deterministic fallback rotation. */
  seed: string;
}

export interface TopicSelectionResult {
  topic: string;
  reason: string;
}

function dedupe(topics: string[]): string[] {
  return [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
}

function executable(topics: string[]): string[] {
  return topics.filter((t) => EXECUTABLE_TOPICS.includes(t) || !NON_EXECUTABLE.has(t));
}

/** Deterministic hash used to pick a fallback topic when context is empty. */
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function preferLeastUsed(candidates: string[], usedTopics: string[]): string {
  const counts = new Map<string, number>();
  for (const t of candidates) counts.set(t, (counts.get(t) || 0) + 1);
  const usage = new Map<string, number>();
  for (const t of usedTopics) usage.set(t, (usage.get(t) || 0) + 1);

  // Prefer a candidate that has not been used yet (or used the fewest times).
  let best = candidates[0];
  let bestScore = Infinity;
  for (const t of candidates) {
    const score = usage.get(t) || 0;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/**
 * Deterministically choose the next topic.
 *
 * Priority order:
 *   1. topics derived from failed concepts (practice the weakness)
 *   2. topics from JD required skills
 *   3. topics from JD preferred skills
 *   4. topics from resume skills
 *   5. topics from GitHub technologies + project architecture
 *   6. deterministic rotation over the executable topic catalog
 */
export function selectTopic(input: TopicSelectionInput): TopicSelectionResult {
  const used = input.usedTopics || [];

  const failedTopicCandidates = executable(
    dedupe((input.failedConcepts || []).map(conceptToTopic).filter(Boolean)),
  );

  const fromRequired = executable(
    dedupe((input.jdRequiredSkills || []).map(skillToTopic).filter(Boolean)),
  );
  const fromPreferred = executable(
    dedupe((input.jdPreferredSkills || []).map(skillToTopic).filter(Boolean)),
  );
  const fromResume = executable(
    dedupe((input.resumeSkills || []).map(skillToTopic).filter(Boolean)),
  );
  const fromGithub = executable(
    dedupe([...(input.githubTechnologies || []), ...(input.githubArchitecture || [])].map(skillToTopic).filter(Boolean)),
  );

  const pick = (list: string[], reason: string): TopicSelectionResult | null => {
    if (list.length === 0) return null;
    const topic = preferLeastUsed(list, used);
    return { topic, reason };
  };

  // 1. Failed concepts get highest priority.
  const failedPick = pick(failedTopicCandidates, 'from previous performance');
  if (failedPick) return failedPick;

  // 2-5. Context-derived topics, most relevant first.
  for (const [list, reason] of [
    [fromRequired, 'from JD required skills'],
    [fromPreferred, 'from JD preferred skills'],
    [fromResume, 'from resume skills'],
    [fromGithub, 'from GitHub technology profile'],
  ] as Array<[string[], string]>) {
    if (list.length === 0) continue;
    const unused = list.filter((t) => !used.includes(t));
    const target = unused.length ? unused : list;
    const topic = preferLeastUsed(target, used);
    if (topic) return { topic, reason };
  }

  // 6. Deterministic rotation across the catalog when no context exists.
  const seedIdx = hashSeed(input.seed) % EXECUTABLE_TOPICS.length;
  const rotated = [...EXECUTABLE_TOPICS.slice(seedIdx), ...EXECUTABLE_TOPICS.slice(0, seedIdx)];
  const unused = rotated.filter((t) => !used.includes(t));
  return { topic: unused.length ? unused[0] : rotated[0], reason: 'from topic catalog rotation' };
}

/** Collect technology + architecture tokens from a GitHub/project profile. */
export function collectGithubTopicInput(profile: {
  technologyProfile?: { frontend?: string[]; backend?: string[]; database?: string[]; programmingLanguages?: string[]; frameworks?: string[]; libraries?: string[]; devops?: string[]; testing?: string[]; other?: string[] } | null;
  architecture?: { patterns?: string[]; apiEndpoints?: Array<{ method: string; path: string }> | null } | null;
  languages?: string[] | null;
}): { technologies: string[]; architecture: string[] } {
  const tech: string[] = [];
  const arch: string[] = [];
  const t = profile.technologyProfile;
  if (t) {
    for (const key of ['frontend', 'backend', 'database', 'programmingLanguages', 'frameworks', 'libraries', 'devops', 'testing', 'other'] as const) {
      const vals = t[key];
      if (Array.isArray(vals)) tech.push(...vals);
    }
  }
  if (Array.isArray(profile.languages)) tech.push(...profile.languages);
  const a = profile.architecture;
  if (a) {
    if (Array.isArray(a.patterns)) arch.push(...a.patterns);
    if (Array.isArray(a.apiEndpoints)) arch.push(...a.apiEndpoints.map((e) => `${e.method} ${e.path}`));
  }
  return { technologies: tech.slice(0, 60), architecture: arch.slice(0, 40) };
}
