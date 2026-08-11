/**
 * GitHub Repository Analyzer — repository indexing / summarization layer.
 *
 * Given a repo URL (https://github.com/user/project) it:
 *   1. validates the repository (SSRF-safe — only github.com URLs are accepted)
 *   2. fetches metadata, README, file tree, dependency/config files and a
 *      curated set of relevant source files (never the whole repo)
 *   3. deterministically detects the technology stack + architecture
 *   4. classifies every file, builds a searchable project index, extracts
 *      evidence (claim -> files), and derives evidence-grounded interview
 *      questions + follow-ups
 *   5. builds a structured `ProjectProfile` that feeds the interview engine
 *
 * The LLM is never sent the whole repository — only the summarised profile.
 *
 * The network transport is injectable (AnalyzeOptions.fetchImpl) so tests can
 * run fully deterministically against a mock GitHub API — no live calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractSkills, normalizeSkill } from './skills';

const GH_API = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'InterviewPilot',
  'X-GitHub-Api-Version': '2022-11-28',
};
const RAW_HEADERS = {
  Accept: 'application/vnd.github.raw',
  'User-Agent': 'InterviewPilot',
  'X-GitHub-Api-Version': '2022-11-28',
};

export interface RepoFile {
  path: string;
  content: string;
}

// ──────────────────────────────────────────────────────────────
// Error taxonomy
// ──────────────────────────────────────────────────────────────

export type RepoAnalysisErrorCode =
  | 'INVALID_URL'
  | 'NOT_FOUND'
  | 'PRIVATE'
  | 'RATE_LIMITED'
  | 'EMPTY'
  | 'FETCH';

export class RepoAnalysisError extends Error {
  code: RepoAnalysisErrorCode;
  status: number;

  constructor(code: RepoAnalysisErrorCode, message: string, status = 502) {
    super(message);
    this.name = 'RepoAnalysisError';
    this.code = code;
    this.status = status;
  }
}

// ──────────────────────────────────────────────────────────────
// Transport (injectable so tests never touch the network)
// ──────────────────────────────────────────────────────────────

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface AnalyzeOptions {
  /** Network transport override. Defaults to global fetch(). */
  fetchImpl?: (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchLikeResponse>;
  /** Cache TTL in ms (default 1h). Pass 0 to disable time-based caching. */
  cacheTtlMs?: number;
  /** Set false to bypass the cache entirely. */
  useCache?: boolean;
  /** Abort signal for the underlying requests. */
  signal?: AbortSignal;
  /** How many source files to read for analysis (default 6, cap 40). */
  sourceFileCount?: number;
  /** Max tree entries considered (default 250, cap 1000). */
  maxTreeFiles?: number;
}

// ──────────────────────────────────────────────────────────────
// Core types
// ──────────────────────────────────────────────────────────────

export interface RepoAnalysis {
  url: string;
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  primaryLanguage: string | null;
  languages: string[];
  languagesBytes: Record<string, number>;
  readme: string | null;
  fileTree: string[];
  configFiles: RepoFile[];
  sourceFiles: RepoFile[];
  tech: {
    frontend: string[];
    backend: string[];
    database: string[];
    auth: string[];
    apis: string[];
    frameworks: string[];
    libraries: string[];
    deployment: string[];
    testing: string[];
    docker: boolean;
    ciCd: string[];
    aiMl: string[];
    blockchain: string[];
    architecture: string[];
  };
  profile: string;
  analyzedAt: string;
  /** Repo metadata used for caching + ProjectProfile. */
  pushedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  license: string | null;
  topics: string[];
  forks: number;
  openIssues: number;
  sizeKb: number;
  homepage: string | null;
  isArchived: boolean;
  isPrivate: boolean;
  ownerType: string | null;
}

export type FileCategory =
  | 'IMPORTANT_SOURCE'
  | 'SOURCE'
  | 'CONFIGURATION'
  | 'DOCUMENTATION'
  | 'TEST'
  | 'BUILD'
  | 'GENERATED'
  | 'DEPENDENCY'
  | 'ASSET'
  | 'IGNORED';

export const FILE_CATEGORIES: FileCategory[] = [
  'IMPORTANT_SOURCE',
  'SOURCE',
  'CONFIGURATION',
  'DOCUMENTATION',
  'TEST',
  'BUILD',
  'GENERATED',
  'DEPENDENCY',
  'ASSET',
  'IGNORED',
];

export interface TechnologyProfile {
  frontend: string[];
  backend: string[];
  database: string[];
  programmingLanguages: string[];
  frameworks: string[];
  libraries: string[];
  devops: string[];
  testing: string[];
  other: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
}

export interface ArchitectureProfile {
  architecture: string[];
  entryPoints: string[];
  apiEndpoints: ApiEndpoint[];
  dataModels: string[];
  modules: string[];
  patterns: string[];
}

export interface EvidenceItem {
  claim: string;
  files: string[];
}

export interface ReadmeAnalysis {
  summary: string;
  sections: string[];
  claims: EvidenceItem[];
  trusted: boolean;
  notes: string[];
}

export interface ProjectIndexEntry {
  path: string;
  type: FileCategory;
  language: string | null;
  importance: 'high' | 'medium' | 'low';
  summary: string;
  symbols: string[];
  technologies: string[];
  relatedFiles: string[];
}

export interface ProjectQuestion {
  id: string;
  category: string;
  question: string;
  groundedIn: string[];
}

export interface FollowUpItem {
  topic: string;
  prompts: string[];
  groundedIn: string[];
}

export interface RepoConsistency {
  overall: 'aligned' | 'partially-aligned' | 'diverged';
  score: number;
  matches: Array<{ resumeSkill: string; githubEvidence: string[]; note: string }>;
  gaps: Array<{ resumeSkill: string; note: string }>;
  summary: string;
}

export interface ProjectRelevance {
  overall: 'high' | 'medium' | 'low';
  score: number;
  relevantAreas: Array<{ jdRequirement: string; githubEvidence: string[] }>;
  missingAreas: Array<{ jdRequirement: string; note: string }>;
  summary: string;
}

// §9 — ProjectProfile schema
export interface ProjectProfile {
  repoUrl: string;
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null;
  primaryLanguage: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  sizeKb: number;
  topics: string[];
  isArchived: boolean;
  isPrivate: boolean;
  ownerType: string | null;
  defaultBranch: string;
  languages: string[];
  languagesBreakdown: Record<string, number>;
  createdAt: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
  analyzedAt: string;
  readme: ReadmeAnalysis;
  fileCount: number;
  fileTree: string[];
  fileCategories: Record<FileCategory, string[]>;
  technologyProfile: TechnologyProfile;
  architecture: ArchitectureProfile;
  sourceFiles: RepoFile[];
  configFiles: RepoFile[];
  projectIndex: ProjectIndexEntry[];
  evidence: EvidenceItem[];
  apiEndpoints: ApiEndpoint[];
  entryPoints: string[];
  dataModels: string[];
  scripts: Record<string, string>;
  testingStrategy: string[];
  deployStrategy: string[];
  risks: string[];
  summary: string;
  questions: ProjectQuestion[];
  followUps: FollowUpItem[];
}

// ──────────────────────────────────────────────────────────────
// Caching — keyed by owner/repo, entries carry the repo's pushed_at
// so a fresh metadata fetch can detect that the repo changed. The
// default TTL mirrors routes/github.ts (1h) and is never infinite.
// ──────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { fetchedAt: number; pushedAt: string | null; detail: RepoAnalysis }>();

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      if (entry?.key && entry?.fetchedAt && entry?.detail?.fullName) {
        cache.set(entry.key, {
          fetchedAt: entry.fetchedAt,
          pushedAt: entry.pushedAt ?? null,
          detail: entry.detail,
        });
      }
    }
  } catch (err) {
    console.error('[RepoAnalyzer] failed to load cache:', (err as Error).message);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function persistCache() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const entries = Array.from(cache.entries()).map(([key, v]) => ({ key, ...v }));
      fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2));
    } catch (err) {
      console.error('[RepoAnalyzer] failed to persist cache:', (err as Error).message);
    }
  }, 300);
}

loadCache();

/** Clear the in-memory cache (used by tests to reset state). */
export function clearRepoCache(): void {
  cache.clear();
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  } catch {
    /* ignore */
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_.-]{1,100}$/.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    return { owner, repo };
  }
  // SSRF-safe: only github.com (optionally www./http) URLs are accepted.
  const m = trimmed.match(/^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (m) return { owner: m[1], repo: m[2] };
  return null;
}

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'obj', '.git', '.github',
  '.vscode', '.idea', 'vendor', 'coverage', '.next', '.nuxt', '.venv', 'venv',
  '__pycache__', '.cache', 'images', 'fonts', 'icons',
]);

const LOCK_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|uv\.lock)$/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|c|cpp|h|hpp|swift|scala|vue|svelte|sql)$/i;
const MAX_FILE_SIZE = 200_000;

const CONFIG_FILES = new Set([
  'package.json', 'requirements.txt', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.env.example',
  'go.mod', 'Cargo.toml', 'setup.py', 'pyproject.toml', 'Makefile',
  '.github/workflows/ci.yml', '.gitlab-ci.yml', 'Jenkinsfile', 'vercel.json', 'render.yaml',
]);

// Generated output directories (never analyzed, always classified GENERATED).
const GENERATED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', '.next', '.nuxt', '.vercel',
  'coverage', '.cache', '__pycache__', '.venv', 'venv', '.git', 'deps', 'bower_components',
  '.gradle', '.mvn', 'generated', 'lib/site-packages',
]);

const ASSET_DIRS = new Set([
  'assets', 'images', 'img', 'fonts', 'icons', 'static', 'public', 'media',
  'audio', 'videos', 'pics', 'sounds', 'favicons', 'logos',
]);

const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|mp4|webm|mp3|wav|ogg|woff2?|ttf|eot|otf|otc|cur)$/i;

const DOC_EXT = /\.(md|mdx|rst|adoc|txt)$/i;

const STYLE_EXT = /\.(css|scss|sass|less)$/i;

const TEST_MARKERS = /(^|\/)(__tests__|tests?|spec|e2e|integration)(\/|$)|\.(test|spec|e2e)\./i;

const BUILD_FILES = /(^|\/)(dockerfile|dockerfile\.\w+|\.dockerignore|makefile|jenkinsfile|\.gitlab-ci\.yml|\.github\/workflows\/.*|\.github\/workflows\/)$|^.*\.mk$/i;

const CONFIG_PATTERNS = /(^|\/)(package\.json|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|webpack\.config\.\w+|rollup\.config\.\w+|next\.config\.\w+|eslint\.config\.\w+|\.eslintrc[^/]*|prettier\.config\.\w+|\.prettierrc[^/]*|requirements\.txt|pom\.xml|build\.gradle\.?kts?|go\.mod|Cargo\.toml|setup\.py|pyproject\.toml|Pipfile|Gemfile|composer\.json|\.env\.example|\.nvmrc|\.tool-versions|docker-compose\.[^/]*\.ya?ml|vercel\.json|render\.yaml|fly\.toml|netlify\.toml|azure-pipelines\.yml|\.npmrc|\.yarnrc|\.pnpmfile[^/]*)$/i;

const IMPORTANT_DIRS = new Set([
  'src', 'lib', 'app', 'api', 'routes', 'controllers', 'services', 'models',
  'components', 'core', 'internal', 'packages', 'pages', 'server', 'client',
  'modules', 'middleware', 'utils', 'helpers', 'hooks', 'store', 'contexts',
  'repos', 'repositories', 'views', 'config', 'handlers', 'domain', 'queries',
  'schema', 'schemas', 'workers', 'jobs', 'events',
]);

const ENTRY_FILE_NAMES = /^(main|server|app|index|run|manage|__main__|cli|bootstrap|start)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|php|rs)$/i;

function isKeepablePath(p: string): boolean {
  const segments = p.split('/');
  if (segments.some((seg) => IGNORED_DIRS.has(seg) || seg.startsWith('.'))) return false;
  if (LOCK_FILES.test(p)) return false;
  return true;
}

function interestScore(p: string): number {
  const lower = p.toLowerCase();
  let score = 0;
  if (['src', 'lib', 'app', 'server', 'client', 'routes', 'controllers', 'services', 'models', 'components', 'core', 'internal', 'packages', 'api', 'pages', 'modules'].some((d) => lower.split('/').includes(d))) score += 3;
  if (SOURCE_EXT.test(p)) score += 2;
  if (/(readme|dockerfile|compose|package\.json|requirements|\.env)/i.test(lower)) score += 2;
  return score;
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : `${s.slice(0, max)}\n…[truncated]`;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Deterministic stable hash for question ids. */
export function hashId(input: string, len = 10): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  return hex.slice(0, len);
}

// ──────────────────────────────────────────────────────────────
// File classification (9 categories + OTHER/IGNORED)
// ──────────────────────────────────────────────────────────────

export function classifyFile(p: string): FileCategory {
  const lower = p.toLowerCase();
  const segments = lower.split('/');
  const name = segments[segments.length - 1];

  // Explicit dotfile configs are configuration, other dotfiles/dirs ignored.
  if (segments.some((s) => s.startsWith('.'))) {
    if (CONFIG_PATTERNS.test(lower)) return 'CONFIGURATION';
    if (BUILD_FILES.test(lower)) return 'BUILD';
    if (/(^|\/)(\.github\/workflows\/)/.test(lower)) return 'BUILD';
    return 'IGNORED';
  }

  if (LOCK_FILES.test(lower)) return 'DEPENDENCY';
  if (segments.some((s) => GENERATED_DIRS.has(s))) return 'GENERATED';
  if (ASSET_EXT.test(lower) || segments.some((s) => ASSET_DIRS.has(s))) return 'ASSET';

  if (DOC_EXT.test(lower) || /(^|\/)docs?(\/|$)/.test(lower) || /^(readme|read_me|license|contributing|changelog|roadmap|architecture|contributing)/i.test(name)) {
    return 'DOCUMENTATION';
  }

  if (TEST_MARKERS.test(lower)) return 'TEST';
  if (BUILD_FILES.test(lower)) return 'BUILD';
  if (CONFIG_PATTERNS.test(lower)) return 'CONFIGURATION';

  if (STYLE_EXT.test(lower)) return 'SOURCE';

  if (SOURCE_EXT.test(lower)) {
    const dirs = segments.slice(0, -1);
    const important = dirs.some((d) => IMPORTANT_DIRS.has(d));
    const entryLike = ENTRY_FILE_NAMES.test(name) && segments.length <= 3;
    if (important || entryLike) return 'IMPORTANT_SOURCE';
    return 'SOURCE';
  }

  return 'IGNORED';
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#',
  c: 'C', cpp: 'C++', h: 'C/C++ Header', hpp: 'C++', swift: 'Swift', scala: 'Scala', vue: 'Vue',
  svelte: 'Svelte', sql: 'SQL',
};

export function languageFromPath(p: string): string | null {
  const name = p.split('/').pop() || '';
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
  return ext ? (EXT_LANGUAGE[ext.toLowerCase()] || null) : null;
}

function importanceFor(type: FileCategory, p: string): 'high' | 'medium' | 'low' {
  switch (type) {
    case 'IMPORTANT_SOURCE':
      return 'high';
    case 'SOURCE':
      return 'medium';
    case 'CONFIGURATION':
    case 'TEST':
    case 'BUILD':
    case 'DOCUMENTATION':
      return 'medium';
    default:
      return 'low';
  }
}

// ──────────────────────────────────────────────────────────────
// Technology detection (deterministic)
// ──────────────────────────────────────────────────────────────

function detectTech(combined: string, files: string[], languages: string[], deps: string[]): RepoAnalysis['tech'] {
  const has = (re: RegExp) => re.test(combined);
  const t = {
    frontend: [] as string[],
    backend: [] as string[],
    database: [] as string[],
    auth: [] as string[],
    apis: [] as string[],
    frameworks: [] as string[],
    libraries: [] as string[],
    deployment: [] as string[],
    testing: [] as string[],
    docker: false,
    ciCd: [] as string[],
    aiMl: [] as string[],
    blockchain: [] as string[],
    architecture: [] as string[],
  };

  const j = (re: RegExp, name: string) => {
    if (has(re)) t.frameworks.push(name);
  };

  if (has(/\b(react|reactjs|react-dom)\b/i)) t.frontend.push('React');
  if (has(/\b(vue|nuxt)\b/i)) t.frontend.push('Vue/Nuxt');
  if (has(/\b(angular)\b/i)) t.frontend.push('Angular');
  if (has(/\b(svelte)\b/i)) t.frontend.push('Svelte');
  if (has(/\b(next\.?js|nextjs)\b/i)) t.frontend.push('Next.js');
  if (has(/\b(vite)\b/i)) t.frontend.push('Vite');
  if (has(/\b(tailwind)\b/i)) t.frontend.push('Tailwind CSS');
  if (has(/\bhtml|\.tsx|\.jsx\b/i)) t.frontend.push('HTML/TSX');
  if (files.some((f) => /^src\/.+\.(tsx|jsx|vue|svelte)$/.test(f) || /^app\//.test(f))) t.frontend.push('SPA structure');

  if (has(/\b(express|fastify)\b/i)) t.backend.push('Express/Fastify');
  if (has(/\b(django)\b/i)) t.backend.push('Django');
  if (has(/\b(flask)\b/i)) t.backend.push('Flask');
  if (has(/\b(fastapi)\b/i)) t.backend.push('FastAPI');
  if (has(/\b(spring[- ]?boot|springframework)\b/i)) t.backend.push('Spring Boot');
  if (has(/\b(nest\.?js|nestjs)\b/i)) t.backend.push('NestJS');
  if (has(/\b(rails)\b/i)) t.backend.push('Ruby on Rails');
  if (has(/\b(node\.?js|nodejs)\b/i)) t.backend.push('Node.js');
  if (has(/\b(golang|go 1\.|\.go)\b/i)) t.backend.push('Go');
  if (has(/\b(dotnet|asp\.net|\.net core)\b/i)) t.backend.push('.NET/ASP.NET');
  if (has(/\b(socket\.io|socketio)\b/i)) t.apis.push('Socket.IO');
  if (has(/\b(graphql)\b/i)) t.apis.push('GraphQL');
  if (has(/\b(grpc)\b/i)) t.apis.push('gRPC');
  if (has(/\b(rest|restful)\b/i)) t.apis.push('REST');

  if (has(/\b(postgres|pg)\b/i)) t.database.push('PostgreSQL');
  if (has(/\b(mysql)\b/i)) t.database.push('MySQL');
  if (has(/\b(mongodb|mongoose)\b/i)) t.database.push('MongoDB');
  if (has(/\b(redis)\b/i)) t.database.push('Redis');
  if (has(/\b(supabase)\b/i)) t.database.push('Supabase');
  if (has(/\b(firebase|firestore)\b/i)) t.database.push('Firebase');
  if (has(/\b(prisma)\b/i)) t.database.push('Prisma ORM');
  if (has(/\b(sqlite)\b/i)) t.database.push('SQLite');
  if (has(/\b(elasticsearch)\b/i)) t.database.push('Elasticsearch');

  if (has(/\b(jwt|jsonwebtoken)\b/i)) t.auth.push('JWT');
  if (has(/\b(passport|auth0|nextauth|clerk)\b/i)) t.auth.push('Passport/Auth0');
  if (has(/\b(supabase\.auth|firebase\.auth|firebase-admin)\b/i)) t.auth.push('Managed Auth');

  j(/\b(docker)\b/i, 'Docker');
  if (files.some((f) => /dockerfile/i.test(f))) t.docker = true;
  if (files.some((f) => /docker-compose/i.test(f))) t.deployment.push('docker-compose');
  if (files.some((f) => /vercel\.json/i.test(f))) t.deployment.push('Vercel');
  if (files.some((f) => /render\.yaml/i.test(f))) t.deployment.push('Render');
  if (has(/\b(aws|lambda|s3|ec2|azure|gcp)\b/i)) t.deployment.push('Cloud (AWS/Azure/GCP)');
  if (has(/\b(kubernetes|k8s|helm)\b/i)) t.deployment.push('Kubernetes');
  if (files.some((f) => /^\.github\/workflows\//.test(f))) t.ciCd.push('GitHub Actions');
  if (files.some((f) => /^\.gitlab-ci\.yml$/.test(f))) t.ciCd.push('GitLab CI');
  if (files.some((f) => /jenkinsfile/i.test(f))) t.ciCd.push('Jenkins');

  if (has(/\b(jest|vitest|mocha|chai|junit|pytest|cypress|playwright|selenium)\b/i)) t.testing.push('Test framework(s)');

  if (has(/\b(tensorflow|torch|pytorch|keras|sklearn|scikit-learn)\b/i)) t.aiMl.push('ML frameworks');
  if (has(/\b(langchain|langgraph|openai|gpt-|huggingface|transformers|rag)\b/i)) t.aiMl.push('LLM/GenAI');
  if (has(/\b(spacy|nltk|opencv)\b/i)) t.aiMl.push('NLP/CV');

  if (has(/\b(solidity|hardhat|ethers|web3|ethereum|solana)\b/i)) t.blockchain.push('Blockchain/web3');

  if (files.some((f) => /^packages\//.test(f))) t.architecture.push('Monorepo (packages/)');
  if (files.some((f) => /^services\//.test(f)) || (files.some((f) => /^server\//.test(f)) && files.some((f) => /^client\//.test(f)))) t.architecture.push('Client/Server split');
  if (files.some((f) => /(^|\/)(routes|controllers|services|models|components)\//.test(f))) t.architecture.push('Modular layering');

  if (t.frontend.length) t.frameworks.push(...t.frontend);
  if (t.backend.length) t.frameworks.push(...t.backend);

  // libraries from dependencies
  for (const d of deps.slice(0, 12)) {
    if (/^(react|react-dom|axios|lodash|zustand|framer-motion|redux|date-fns|moment|socket\.io|express|dotenv|helmet|cors|uuid|pg)$/i.test(d)) {
      t.libraries.push(d);
    }
  }

  t.frameworks = unique(t.frameworks);
  t.libraries = unique(t.libraries);
  t.frontend = unique(t.frontend);
  t.backend = unique(t.backend);
  t.database = unique(t.database);
  t.auth = unique(t.auth);
  t.apis = unique(t.apis);
  t.deployment = unique(t.deployment);
  t.testing = unique(t.testing);
  t.ciCd = unique(t.ciCd);
  t.aiMl = unique(t.aiMl);
  t.blockchain = unique(t.blockchain);
  t.architecture = unique(t.architecture);
  return t;
}

function buildProfile(a: Omit<RepoAnalysis, 'profile' | 'analyzedAt'>): string {
  const lines: string[] = [];
  lines.push(`Repository: ${a.fullName}${a.description ? ` — ${a.description}` : ''}`);
  lines.push(`Primary language: ${a.primaryLanguage || 'n/a'}${a.stars ? ` · ${a.stars} stars` : ''}`);
  if (a.languages.length) lines.push(`Languages: ${a.languages.join(', ')}`);

  const t = a.tech;
  const push = (label: string, vals: string[]) => {
    if (vals.length) lines.push(`${label}: ${vals.join(', ')}`);
  };
  push('Frontend', t.frontend);
  push('Backend', t.backend);
  push('Database', t.database);
  push('Auth', t.auth);
  push('APIs/Realtime', t.apis);
  push('Testing', t.testing);
  push('Deployment', t.deployment);
  if (t.docker) lines.push('Docker: Dockerfile present');
  if (t.ciCd.length) push('CI/CD', t.ciCd);
  push('AI/ML', t.aiMl);
  push('Blockchain', t.blockchain);
  push('Architecture', t.architecture);

  if (a.readme) {
    lines.push(`README:\n${a.readme.split('\n').slice(0, 40).join('\n')}`);
  }
  if (a.configFiles.length) {
    lines.push('Configuration files:');
    for (const f of a.configFiles) {
      lines.push(`  - ${f.path}\n${f.content.split('\n').slice(0, 30).map((l) => `    ${l}`).join('\n')}`);
    }
  }
  if (a.sourceFiles.length) {
    lines.push('Key source files:');
    for (const f of a.sourceFiles) {
      lines.push(`  - ${f.path}\n${f.content.split('\n').slice(0, 35).map((l) => `    ${l}`).join('\n')}`);
    }
  }
  if (a.fileTree.length) {
    lines.push(`File tree (${a.fileTree.length} files): ${a.fileTree.slice(0, 60).join(', ')}`);
  }
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// TechnologyProfile (exact §7 schema) — config-file driven + skill catalog
// ──────────────────────────────────────────────────────────────

// Canonical library names (via the skill catalog) that go into `libraries`.
const LIBRARY_NAMES = new Set([
  'axios', 'Lodash', 'Zustand', 'Redux', 'Framer Motion', 'Material UI', 'Bootstrap',
  'Three.js', 'D3.js', 'React Query', 'Helmet', 'Prisma', 'Mongoose', 'Sequelize',
  'TypeORM', 'Socket.IO', 'Moment', 'Styled Components', 'jQuery', 'Nginx',
]);

const FRAMEWORK_NAMES = new Set([
  'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Express', 'NestJS', 'Spring',
  'Django', 'Flask', 'FastAPI', 'Ruby on Rails', 'Laravel', 'ASP.NET', 'GraphQL',
]);

function allTechNames(tech: TechnologyProfile): string[] {
  return unique([
    ...tech.frontend, ...tech.backend, ...tech.database, ...tech.programmingLanguages,
    ...tech.frameworks, ...tech.libraries, ...tech.devops, ...tech.testing, ...tech.other,
  ]);
}

export function detectTechnologyProfile(
  a: Pick<RepoAnalysis, 'tech' | 'fileTree' | 'languages' | 'readme' | 'configFiles' | 'sourceFiles'>,
): TechnologyProfile {
  // Detection is driven by code evidence (config + source files + GitHub
  // language stats). The README is deliberately excluded so claims that only
  // appear in prose ("uses Kubernetes") are NOT treated as repository proof —
  // analyzeReadme surfaces those as unverified notes instead.
  const codeCombined = [
    ...a.configFiles.map((f) => `${f.path}\n${f.content}`),
    ...a.sourceFiles.map((f) => `${f.path}\n${f.content}`),
    a.languages.join(','),
  ].join('\n');

  const skills = extractSkills(codeCombined, 'repo');
  const byCat = new Map<string, string[]>();
  for (const s of skills) {
    const list = byCat.get(s.category) || [];
    if (!list.includes(s.skill)) list.push(s.skill);
    byCat.set(s.category, list);
  }
  const cat = (c: string) => byCat.get(c) || [];

  const programmingLanguages: string[] = [];
  for (const lang of a.languages) {
    const normalized = normalizeSkill(lang);
    const display = normalized || lang.replace(/^[a-z0-9]/i, (ch) => ch.toUpperCase());
    if (!programmingLanguages.includes(display)) programmingLanguages.push(display);
  }
  for (const s of cat('Programming')) {
    if (!programmingLanguages.includes(s)) programmingLanguages.push(s);
  }

  const frontend = unique([...cat('Frontend')]);
  const backend = unique([...cat('Backend')]);
  const database = unique([...cat('Database'), ...a.tech.database]);
  const devops = unique([
    ...cat('DevOps'), ...cat('Cloud'), ...a.tech.deployment, ...a.tech.ciCd,
    ...(a.tech.docker ? ['Docker'] : []),
  ]);
  const testing = unique([...cat('Testing'), ...a.tech.testing]);
  const other = unique([
    ...cat('AI/ML'), ...cat('Data'), ...cat('Security'), ...cat('Networking'),
    ...cat('Blockchain'), ...cat('Mobile'), ...cat('Design'), ...cat('Tools'),
    ...a.tech.auth, ...a.tech.apis, ...a.tech.aiMl, ...a.tech.blockchain,
  ]);
  const frameworks = unique([
    ...a.tech.frameworks,
    ...frontend.filter((s) => FRAMEWORK_NAMES.has(s)),
    ...backend.filter((s) => FRAMEWORK_NAMES.has(s)),
  ]);
  const libraries = unique([
    ...a.tech.libraries,
    ...frontend.filter((s) => LIBRARY_NAMES.has(s)),
    ...backend.filter((s) => LIBRARY_NAMES.has(s)),
    ...database.filter((s) => LIBRARY_NAMES.has(s)),
    ...cat('Tools').filter((s) => LIBRARY_NAMES.has(s)),
  ]);

  return {
    frontend,
    backend,
    database,
    programmingLanguages,
    frameworks,
    libraries,
    devops,
    testing,
    other,
  };
}

// ──────────────────────────────────────────────────────────────
// Symbol / API endpoint / data model extraction
// ──────────────────────────────────────────────────────────────

export function extractSymbols(content: string): string[] {
  const out: string[] = [];
  const re = /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|def)\s+([A-Za-z_$][A-Za-z0-9_$]*)(?=\s*(?:[=(:{<]|$))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const s = m[1];
    if (s !== '{' && s !== '(' && !out.includes(s)) out.push(s);
  }
  return unique(out).slice(0, 24);
}

function extractApiEndpointsFromFile(file: string, content: string, out: ApiEndpoint[]): void {
  const lines = content.split('\n');
  for (const line of lines) {
    const express = line.match(/\.(get|post|put|delete|patch|options)\(\s*["'`]([^"'`]+)["'`]/i);
    if (express) {
      out.push({ method: express[1].toUpperCase(), path: express[2], file });
      continue;
    }
    const fastapi = line.match(/@(?:app|router)\.(?:get|post|put|delete|patch|api_route)\(\s*["']([^"']+)["']/i);
    if (fastapi) {
      out.push({ method: 'ANY', path: fastapi[1], file });
      continue;
    }
    const spring = line.match(/@(?:Get|Post|Put|Delete|Patch|Request)Mapping\(\s*["']([^"']+)["']/i);
    if (spring) {
      out.push({ method: 'ANY', path: spring[1], file });
      continue;
    }
    const nest = line.match(/@(?:Get|Post|Put|Delete|Patch)\(\s*['"]([^'"]+)['"]/i);
    if (nest) {
      out.push({ method: 'ANY', path: nest[1], file });
      continue;
    }
    const django = line.match(/path\(\s*["']([^"']+)["']/i);
    if (django) {
      out.push({ method: 'ANY', path: django[1], file });
      continue;
    }
    const lambda = line.match(/lambda_function|handle\(event/);
    if (lambda) {
      out.push({ method: 'ANY', path: 'lambda-handler', file });
    }
  }
}

function extractDataModelsFromFile(file: string, content: string, out: string[]): void {
  const typeRe = /(?:export\s+)?(?:interface|type)\s+([A-Z][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(content))) if (!out.includes(m[1])) out.push(m[1]);
  const classRe = /(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g;
  while ((m = classRe.exec(content))) if (!out.includes(m[1])) out.push(m[1]);
  const prisma = /^\s*model\s+([A-Za-z0-9_]+)/gm;
  while ((m = prisma.exec(content))) if (!out.includes(m[1])) out.push(m[1]);
  const seq = /sequelize\.define\(\s*['"]([A-Za-z0-9_]+)['"]/g;
  while ((m = seq.exec(content))) if (!out.includes(m[1])) out.push(m[1]);
  const mongoose = /\bnew\s+Schema\(\s*\{/g;
  if (mongoose.test(content) && !out.includes('Mongoose Schema')) out.push('Mongoose Schema');
  const sql = /create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_"`[\].]+)/gi;
  while ((m = sql.exec(content))) {
    const name = m[1].replace(/["`[\]]/g, '').trim();
    if (name && !out.includes(name)) out.push(name);
  }
}

function extractScripts(analysis: RepoAnalysis): Record<string, string> {
  const pkg = analysis.configFiles.find((f) => f.path.toLowerCase() === 'package.json');
  if (!pkg) return {};
  try {
    const parsed = JSON.parse(pkg.content);
    const scripts = parsed.scripts || {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(scripts)) {
      if (typeof v === 'string') out[k.slice(0, 60)] = v.slice(0, 120);
    }
    return out;
  } catch {
    return {};
  }
}

// ──────────────────────────────────────────────────────────────
// Architecture detection
// ──────────────────────────────────────────────────────────────

export function detectArchitecture(a: RepoAnalysis): ArchitectureProfile {
  const apiEndpoints: ApiEndpoint[] = [];
  const dataModels: string[] = [];
  const entryPoints: string[] = [];
  const modules: string[] = [];
  const patterns: string[] = [];
  const tree = a.fileTree;
  const lower = tree.map((f) => f.toLowerCase());

  for (const f of tree) {
    const name = f.split('/').pop() || '';
    if (ENTRY_FILE_NAMES.test(name) && f.split('/').length <= 3 && !entryPoints.includes(f)) {
      entryPoints.push(f);
    }
  }

  const topDirs = new Set<string>();
  for (const f of tree) {
    const parts = f.split('/');
    if (parts.length >= 2) topDirs.add(parts[0]);
    if (parts.length >= 3) topDirs.add(`${parts[0]}/${parts[1]}`);
  }
  for (const d of [
    'src', 'lib', 'app', 'api', 'routes', 'controllers', 'services', 'models',
    'components', 'pages', 'utils', 'helpers', 'hooks', 'store', 'middleware',
    'repos', 'repositories', 'views', 'config', 'core', 'internal', 'server',
    'client', 'packages', 'modules', 'workers', 'jobs', 'events', 'schema',
  ]) {
    if (topDirs.has(d) || topDirs.has(`${d}/`)) modules.push(d);
  }

  if (lower.some((f) => /(^|\/)(controllers|services|models|repositories|repos|routes)\//.test(f))) patterns.push('Layered / service-oriented structure');
  if (lower.some((f) => /(^|\/)(models|views|controllers)\//.test(f))) patterns.push('MVC-style separation');
  if (lower.some((f) => /^packages\//.test(f))) patterns.push('Monorepo (packages/)');
  if (lower.some((f) => /^services\//.test(f)) && lower.some((f) => !/^services\/[^/]+\/tests/.test(f))) patterns.push('Microservice-style services/');
  if (lower.some((f) => /^server\//.test(f)) && lower.some((f) => /^client\//.test(f))) patterns.push('Client/server split');
  if (lower.some((f) => /(^|\/)hooks\//.test(f)) || lower.some((f) => /(^|\/)store\//.test(f))) patterns.push('Frontend state/hooks organization');
  if (lower.some((f) => /(^|\/)(workers?|jobs?|queue)\//.test(f))) patterns.push('Background jobs / workers');
  if (lower.some((f) => /(^|\/)(events?|pubsub|messaging)\//.test(f))) patterns.push('Event / pub-sub handling');
  if (lower.some((f) => /dockerfile/i.test(f))) patterns.push('Containerized (Dockerfile)');
  if (lower.some((f) => /(^|\/)test[s]?(\/|$)|\.(test|spec)\./.test(f))) patterns.push('Automated test suite present');

  for (const f of a.sourceFiles) extractApiEndpointsFromFile(f.path, f.content, apiEndpoints);
  for (const f of a.sourceFiles) extractDataModelsFromFile(f.path, f.content, dataModels);

  return {
    architecture: unique(patterns),
    entryPoints: unique(entryPoints).slice(0, 12),
    apiEndpoints: unique(apiEndpoints).slice(0, 40),
    dataModels: unique(dataModels).slice(0, 40),
    modules: unique(modules).slice(0, 24),
    patterns: unique(patterns),
  };
}

// ──────────────────────────────────────────────────────────────
// README analysis — never trusted blindly; claims are cross-checked
// ──────────────────────────────────────────────────────────────

export function analyzeReadme(
  a: Pick<RepoAnalysis, 'readme' | 'fileTree' | 'configFiles' | 'sourceFiles'>,
  tech: TechnologyProfile,
): ReadmeAnalysis {
  const text = (a.readme || '').trim();
  const notes: string[] = [];
  if (!text) {
    return { summary: '', sections: [], claims: [], trusted: false, notes: ['No README was found in this repository.'] };
  }

  const sections: string[] = [];
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,4}\s+(.+)$/);
    if (h) sections.push(h[1].replace(/`/g, '').trim());
  }

  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#{1,6}\s+/gm, '').trim())
    .filter((p) => p.length > 0 && !p.startsWith('```'));
  const summary = (paras[0] || text.slice(0, 200)).slice(0, 500);

  const contentByPath = new Map<string, string>();
  for (const f of [...a.configFiles, ...a.sourceFiles]) contentByPath.set(f.path, f.content.toLowerCase());

  // Claims: README lines that mention a detected technology; the evidence
  // files are the repo files where that technology actually appears.
  const profileTech = allTechNames(tech);
  const claims: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const clean = line.trim();
    if (clean.length < 8 || clean.length > 260) continue;
    if (clean.startsWith('#') || clean.startsWith('```') || clean.startsWith('![') || clean.startsWith('[')) continue;
    const mentioned = profileTech.filter((t) => clean.toLowerCase().includes(t.toLowerCase()));
    if (!mentioned.length) continue;
    const files: string[] = [];
    for (const [p, content] of contentByPath) {
      if (mentioned.some((t) => content.includes(t.toLowerCase()))) files.push(p);
    }
    if (files.length && !seen.has(clean)) {
      seen.add(clean);
      claims.push({ claim: clean.slice(0, 180), files: files.slice(0, 8) });
    }
  }

  // Cross-check: README mentions technologies with no code evidence.
  const readmeSkills = extractSkills(text, 'readme').map((s) => s.skill);
  const codeText = [
    ...a.configFiles.map((f) => f.content.toLowerCase()),
    ...a.sourceFiles.map((f) => f.content.toLowerCase()),
  ].join('\n');
  const unverified = unique(readmeSkills).filter((s) => !codeText.includes(s.toLowerCase()));
  if (unverified.length) {
    notes.push(
      `The README mentions ${unverified.slice(0, 5).join(', ')} but no supporting code evidence was found in the repository files — this claim should be treated as unverified.`,
    );
  }
  const confirmed = claims.filter((c) => c.files.length).length;
  notes.push(`${confirmed} README claim(s) were corroborated by actual repository files.`);

  return {
    summary,
    sections: sections.slice(0, 20),
    claims: claims.slice(0, 15),
    trusted: claims.some((c) => c.files.length > 0),
    notes,
  };
}

// ──────────────────────────────────────────────────────────────
// Project index + evidence
// ──────────────────────────────────────────────────────────────

function techTokensInContent(content: string): string[] {
  return extractSkills(content, 'file')
    .slice(0, 10)
    .map((s) => s.skill);
}

function relatedFilesFor(p: string, tree: string[]): string[] {
  const dir = p.split('/').slice(0, -1).join('/');
  const base = p.split('/').pop() || '';
  const stem = base.replace(/\.[^.]+$/, '').toLowerCase();
  const related: string[] = [];
  for (const f of tree) {
    if (f === p) continue;
    const fDir = f.split('/').slice(0, -1).join('/');
    const fStem = (f.split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();
    if ((dir && fDir === dir) || (stem && fStem === stem) || (stem && fStem.includes(stem))) {
      related.push(f);
    }
    if (related.length >= 6) break;
  }
  return related;
}

function fileSummary(p: string, content: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith('package.json')) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.description === 'string' && parsed.description.trim()) return parsed.description.trim().slice(0, 160);
      const deps = Object.keys(parsed.dependencies || {}).slice(0, 8);
      if (deps.length) return `Dependencies: ${deps.join(', ')}`;
      return 'package manifest';
    } catch {
      return 'package manifest';
    }
  }
  const lines = content.split('\n');
  for (const line of lines.slice(0, 30)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      const cleaned = trimmed.replace(/^[#/]*\s?/, '').replace(/\*\//, '').trim();
      if (cleaned.length >= 4) return cleaned.slice(0, 160);
    }
    if (trimmed && !trimmed.startsWith('import') && !trimmed.startsWith('from') && !trimmed.startsWith('require(')) {
      return trimmed.slice(0, 160);
    }
  }
  return '';
}

export function buildProjectIndex(a: RepoAnalysis): ProjectIndexEntry[] {
  const contentByPath = new Map<string, string>();
  for (const f of [...a.configFiles, ...a.sourceFiles]) contentByPath.set(f.path, f.content);

  const entries: ProjectIndexEntry[] = [];
  for (const p of a.fileTree) {
    const type = classifyFile(p);
    if (type === 'IGNORED') continue;
    const content = contentByPath.get(p);
    entries.push({
      path: p,
      type,
      language: languageFromPath(p),
      importance: importanceFor(type, p),
      summary: content ? fileSummary(p, content) : '',
      symbols: content ? extractSymbols(content) : [],
      technologies: content ? techTokensInContent(content) : [],
      relatedFiles: relatedFilesFor(p, a.fileTree),
    });
  }
  return entries;
}

export function buildEvidence(
  tech: TechnologyProfile,
  arch: ArchitectureProfile,
  a: Pick<RepoAnalysis, 'fileTree' | 'configFiles' | 'sourceFiles' | 'readme'>,
): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  const filesContent = [
    ...a.configFiles.map((f) => `${f.path}\n${f.content}`),
    ...a.sourceFiles.map((f) => `${f.path}\n${f.content}`),
  ];
  const fileNames = filesContent.map((txt) => txt.split('\n')[0]);

  const techList = allTechNames(tech);
  for (const t of techList) {
    const files: string[] = [];
    const tl = t.toLowerCase();
    for (let i = 0; i < filesContent.length; i++) {
      if (filesContent[i].toLowerCase().includes(tl) && !files.includes(fileNames[i])) files.push(fileNames[i]);
    }
    if (files.length) {
      evidence.push({ claim: `${t} is used in this repository`, files: files.slice(0, 8) });
    }
  }

  const patternHints: Array<[string, string[]]> = [
    ['Layered / service-oriented structure', ['routes/', 'controllers/', 'services/', 'models/', 'repositories/', 'repos/']],
    ['MVC-style separation', ['models/', 'views/', 'controllers/']],
    ['Monorepo (packages/)', ['packages/']],
    ['Microservice-style services/', ['services/']],
    ['Client/server split', ['server/', 'client/']],
    ['Containerized (Dockerfile)', ['dockerfile']],
    ['Background jobs / workers', ['workers/', 'jobs/', 'queue/']],
    ['Event / pub-sub handling', ['events/', 'pubsub', 'messaging/']],
  ];
  for (const [pattern, hints] of patternHints) {
    if (!arch.patterns.includes(pattern)) continue;
    const files = a.fileTree.filter((f) => hints.some((h) => f.toLowerCase().includes(h))).slice(0, 8);
    if (files.length) evidence.push({ claim: `Architecture: ${pattern}`, files });
  }

  if (a.readme) {
    const readmeClaims = analyzeReadme(a, tech);
    for (const c of readmeClaims.claims) {
      if (c.files.length) evidence.push({ claim: `README: ${c.claim}`, files: c.files });
    }
  }

  return unique(evidence).slice(0, 60);
}

// ──────────────────────────────────────────────────────────────
// Question generation (15 categories, only for present tech)
// ──────────────────────────────────────────────────────────────

const QUESTION_CATEGORIES = [
  'Architecture & design decisions',
  'Technology choices',
  'Data modeling & storage',
  'API design',
  'Frontend implementation',
  'Backend implementation',
  'Testing & quality',
  'DevOps & deployment',
  'Performance & optimization',
  'Security',
  'Error handling & reliability',
  'Scalability',
  'Collaboration & development workflow',
  'Challenges & lessons learned',
  'Outcomes & impact',
];

function groundedFiles(tech: TechnologyProfile, arch: ArchitectureProfile, evidence: EvidenceItem[], terms: string[]): string[] {
  const lower = terms.map((t) => t.toLowerCase());
  const out: string[] = [];
  for (const e of evidence) {
    if (lower.some((t) => e.claim.toLowerCase().includes(t))) out.push(...e.files);
  }
  for (const ep of arch.apiEndpoints) {
    if (lower.some((t) => ep.file.toLowerCase().includes(t))) out.push(ep.file);
  }
  return unique(out).slice(0, 8);
}

export function generateProjectQuestions(
  tech: TechnologyProfile,
  arch: ArchitectureProfile,
  evidence: EvidenceItem[],
): ProjectQuestion[] {
  const questions: ProjectQuestion[] = [];
  const q = (
    category: string,
    question: string,
    groundedIn: string[],
    always = false,
  ) => {
    if (questions.some((x) => x.category === category)) return;
    if (!always && groundedIn.length === 0 && !categoryHasTech(category, tech)) return;
    questions.push({ id: hashId(`${category}:${question}`), category, question, groundedIn: groundedIn.slice(0, 6) });
  };

  const fe = tech.frontend;
  const be = tech.backend;
  const db = tech.database;
  const devops = tech.devops;
  const testing = tech.testing;
  const api = arch.apiEndpoints;
  const entry = arch.entryPoints;
  const models = arch.dataModels;
  const patterns = arch.patterns;

  q(
    'Architecture & design decisions',
    `Looking at your entry point (${entry.length ? entry.slice(0, 2).join(', ') : 'the project root'}) and your ${patterns.length ? patterns.slice(0, 2).join(', ') : 'folder structure'} — walk me through the architectural decisions you made and the trade-offs you considered.`,
    [...entry, ...groundedFiles(tech, arch, evidence, ['Architecture', 'Layered', 'Monorepo', 'split', 'entry point'])],
    true,
  );
  q(
    'Technology choices',
    `Why did you choose ${(fe[0] || be[0] || tech.programmingLanguages[0] || 'this stack')} for this project, and what alternatives did you evaluate?`,
    groundedFiles(tech, arch, evidence, [fe[0] || '', be[0] || '', tech.programmingLanguages[0] || '']),
    true,
  );
  q('Data modeling & storage', `How did you design the data model${db.length ? ` for ${db.slice(0, 3).join(', ')}` : ''} — what entities exist, and how did you decide the schema and query patterns?`, [...models, ...groundedFiles(tech, arch, evidence, db)]);
  q('API design', `Looking at the API endpoints in ${api.slice(0, 4).map((e) => `${e.method} ${e.path} (${e.file})`).join(', ')} — how did you design the API contract and handle versioning or error responses?`, api.slice(0, 6).map((e) => e.file));
  q('Frontend implementation', `In ${fe.slice(0, 3).join(', ')}, how did you structure components and manage state — and how would you scale that to a larger feature set?`, groundedFiles(tech, arch, evidence, fe));
  q('Backend implementation', `Walk me through the core backend flow — how requests are handled${be.length ? ` using ${be.slice(0, 3).join(', ')}` : ''}, where business logic lives, and how you kept modules decoupled.`, groundedFiles(tech, arch, evidence, be));
  q('Testing & quality', `Your repo includes ${testing.slice(0, 4).join(', ') || 'a test suite'} — how do you decide what to test, and what did those tests catch?`, groundedFiles(tech, arch, evidence, testing.concat(['test'])) || groundedFiles(tech, arch, evidence, ['test']));
  q('DevOps & deployment', `How is this project built and deployed${devops.length ? ` (${devops.slice(0, 4).join(', ')})` : ''} — and how would you make the pipeline more robust?`, groundedFiles(tech, arch, evidence, devops));
  q('Performance & optimization', `What performance bottlenecks have you profiled in this codebase, and what optimizations made the biggest difference?`, []);
  q('Security', `What security considerations did you address in this project${tech.other.some((t) => /auth|jwt|oauth|security/i.test(t)) ? ` (I see ${tech.other.filter((t) => /auth|jwt|oauth/i.test(t)).slice(0, 3).join(', ')})` : ''} — authentication, input validation, secrets handling?`, groundedFiles(tech, arch, evidence, ['Auth', 'Security', 'JWT', 'OAuth', 'Validation']));
  q('Error handling & reliability', `How does this system handle failures — retries, fallbacks, error boundaries — and what happens when a critical dependency is down?`, []);
  q('Scalability', `If this project grew to ${api.length > 0 ? '10x the current API load' : '10x the current user base'}, what would you change first?`, []);
  q('Collaboration & development workflow', `How did you and your team collaborate on this repo — branching strategy, code review, and CI checks${devops.some((d) => /actions|ci|jenkins|gitlab/i.test(d)) ? ' you have in place' : ''}?`, groundedFiles(tech, arch, evidence, ['GitHub Actions', 'CI', 'Jenkins', 'GitLab']));
  q('Challenges & lessons learned', `What was the hardest technical problem you solved in this project, and what would you do differently with hindsight?`, []);
  q('Outcomes & impact', `What measurable outcome did this project produce — users, performance gains, revenue — and how did you track it?`, []);

  return questions;
}

function categoryHasTech(category: string, tech: TechnologyProfile): boolean {
  switch (category) {
    case 'Data modeling & storage': return tech.database.length > 0;
    case 'API design': return tech.backend.length > 0;
    case 'Frontend implementation': return tech.frontend.length > 0;
    case 'Backend implementation': return tech.backend.length > 0;
    case 'Testing & quality': return tech.testing.length > 0;
    case 'DevOps & deployment': return tech.devops.length > 0;
    case 'Security': return tech.other.some((t) => /auth|jwt|oauth|security/i.test(t));
    case 'Collaboration & development workflow': return tech.devops.some((d) => /actions|ci|jenkins|gitlab|vercel|docker/i.test(d)) || tech.devops.length > 0;
    default: return true;
  }
}

export function prepareFollowUpBank(
  questions: ProjectQuestion[],
  tech: TechnologyProfile,
  api: ApiEndpoint[],
): FollowUpItem[] {
  const bank: FollowUpItem[] = [];

  const follow = (topic: string, prompts: string[], groundedIn: string[]) => {
    bank.push({ topic, prompts, groundedIn: groundedIn.slice(0, 6) });
  };

  follow('Architecture decisions', [
    'What was the alternative architecture you rejected, and why?',
    'If you added a new feature tomorrow, which module would change the most and why?',
    'How would you split this into microservices without breaking existing behavior?',
  ], questions.find((x) => x.category === 'Architecture & design decisions')?.groundedIn || []);

  follow('Technology stack', [
    `Which technology in this repo would you replace first, and what would you replace it with?`,
    'Which dependency added the most complexity relative to its value?',
    'How did you stay up to date with the versions of these libraries?',
  ], questions.find((x) => x.category === 'Technology choices')?.groundedIn || []);

  if (tech.database.length) {
    follow('Data & storage', [
      'How do you handle schema migrations and backfills?',
      'What indexes did you add, and what query were they solving?',
      'How would you handle a hot key or slow query under load?',
    ], questions.find((x) => x.category === 'Data modeling & storage')?.groundedIn || []);
  }

  if (api.length) {
    follow('API design', [
      'How do you version your API and maintain backwards compatibility?',
      'How do you validate inputs and return consistent error shapes?',
      'What would you add to make this API production-hardened: rate limiting, idempotency, pagination?',
    ], api.slice(0, 6).map((e) => e.file));
  }

  if (tech.frontend.length) {
    follow('Frontend', [
      'How do you handle loading, error, and empty states consistently?',
      'How did you decide between client-side and server-side rendering here?',
      'How would you reduce bundle size or initial load time?',
    ], questions.find((x) => x.category === 'Frontend implementation')?.groundedIn || []);
  }

  if (tech.backend.length) {
    follow('Backend', [
      'How do you handle concurrency — race conditions, deadlocks, or duplicate requests?',
      'Where does authentication and authorization happen in the request flow?',
      'How do you observe this service — logs, metrics, tracing?',
    ], questions.find((x) => x.category === 'Backend implementation')?.groundedIn || []);
  }

  if (tech.testing.length) {
    follow('Testing', [
      'Which test would you delete first, and why?',
      'How do you keep tests fast enough to run on every commit?',
      'What important scenario is NOT covered by the current suite?',
    ], questions.find((x) => x.category === 'Testing & quality')?.groundedIn || []);
  }

  if (tech.devops.length) {
    follow('Deployment & operations', [
      'How do you roll back a bad deploy?',
      'What is the deployment cadence and how is it triggered?',
      'How do you manage environment-specific configuration and secrets?',
    ], questions.find((x) => x.category === 'DevOps & deployment')?.groundedIn || []);
  }

  follow('Problems & outcomes', [
    'Tell me about the most time-consuming bug you fixed in this project.',
    'What metric moved because of this project, and how did you measure it?',
    'What would the "next big thing" for this project be?',
  ], []);

  return bank.slice(0, 14);
}

// ──────────────────────────────────────────────────────────────
// Retrieval — focused context for a specific question
// ──────────────────────────────────────────────────────────────

export function retrieveProjectContext(question: string, profile: ProjectProfile): {
  files: string[];
  summary: string;
  relatedQuestions: string[];
} {
  const tokens = (question.toLowerCase().match(/[a-z][a-z0-9_]*/g) || []).slice(0, 20);
  const scores = new Map<string, number>();

  const bump = (entry: ProjectIndexEntry) => {
    scores.set(entry.path, (scores.get(entry.path) || 0) + 1);
  };

  for (const entry of profile.projectIndex) {
    const hay = [
      entry.path.toLowerCase(),
      entry.summary.toLowerCase(),
      ...entry.symbols.map((s) => s.toLowerCase()),
      ...entry.technologies.map((s) => s.toLowerCase()),
    ].join(' ');
    let hit = 0;
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (hay.includes(t)) hit += 1;
    }
    if (hit > 0) {
      // Weight by importance so key source files win ties.
      const w = entry.importance === 'high' ? 2 : entry.importance === 'medium' ? 1.2 : 0.7;
      scores.set(entry.path, hit * w);
    }
  }

  for (const ep of profile.apiEndpoints) {
    if (tokens.some((t) => ep.path.toLowerCase().includes(t) || ep.file.toLowerCase().includes(t))) {
      scores.set(ep.file, (scores.get(ep.file) || 0) + 2);
    }
  }
  for (const m of profile.dataModels) {
    if (tokens.some((t) => m.toLowerCase().includes(t))) {
      const idx = profile.projectIndex.find((e) => e.path === m);
      if (idx) scores.set(idx.path, (scores.get(idx.path) || 0) + 2);
    }
  }

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path]) => path);

  const related = profile.questions.filter((x) => {
    const q = x.question.toLowerCase();
    return tokens.some((t) => t.length > 3 && q.includes(t));
  });

  const files = ranked.length
    ? ranked
    : profile.projectIndex.filter((e) => e.importance === 'high').slice(0, 5).map((e) => e.path);

  const lines = [`Relevant files for "${question.slice(0, 120)}":`];
  for (const p of files) {
    const entry = profile.projectIndex.find((e) => e.path === p);
    if (!entry) continue;
    const desc = entry.summary ? ` — ${entry.summary}` : '';
    const sym = entry.symbols.length ? ` (${entry.symbols.slice(0, 6).join(', ')})` : '';
    const tech = entry.technologies.length ? ` [${entry.technologies.slice(0, 6).join(', ')}]` : '';
    lines.push(`- ${p}${desc}${sym}${tech}`);
  }
  const relatedIds = unique(related.map((x) => x.id)).slice(0, 4);
  const relatedQuestions = unique(related.map((x) => x.question)).slice(0, 4);

  return { files, summary: lines.join('\n'), relatedQuestions };
}

// ──────────────────────────────────────────────────────────────
// Resume <-> GitHub consistency (non-accusatory)
// ──────────────────────────────────────────────────────────────

export function compareResumeToGithub(
  resumeSkills: string[],
  profile: ProjectProfile,
): RepoConsistency {
  const normalized = normalizeResumeSkills(resumeSkills);
  const repoTech = new Set(allTechNames(profile.technologyProfile).map((t) => t.toLowerCase()));

  const matches: RepoConsistency['matches'] = [];
  const gaps: RepoConsistency['gaps'] = [];
  for (const skill of normalized) {
    const key = skill.toLowerCase();
    if (repoTech.has(key)) {
      const evidenceFiles = profile.evidence
        .filter((e) => e.claim.toLowerCase().includes(key))
        .flatMap((e) => e.files);
      matches.push({
        resumeSkill: skill,
        githubEvidence: unique(evidenceFiles).slice(0, 6),
        note: `"${skill}" appears in this repository's code and dependencies.`,
      });
    } else {
      gaps.push({
        resumeSkill: skill,
        note: `"${skill}" is listed on the resume but no evidence of it was found in the analyzed repository. This may simply mean the repo isn't where that skill was exercised.`,
      });
    }
  }

  const score = normalized.length ? Math.round((matches.length / normalized.length) * 100) : 100;
  const overall: RepoConsistency['overall'] =
    score >= 60 ? 'aligned' : score >= 30 ? 'partially-aligned' : 'diverged';

  const summary =
    matches.length === 0
      ? `The analyzed repository does not visibly exercise the ${normalized.length || 'listed'} skills from the resume. That's not necessarily a gap — it may reflect a different project or role.`
      : `${matches.length} of ${normalized.length || 0} resume skills are backed by evidence in this repository (${score}%).`;

  return { overall, score, matches, gaps, summary };
}

function normalizeResumeSkills(skills: string[]): string[] {
  const out: string[] = [];
  for (const s of skills) {
    const n = normalizeSkill(s);
    const key = n || s.trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// JD + Resume + GitHub relevance
// ──────────────────────────────────────────────────────────────

export function assessProjectRelevance(
  jdSkills: string[],
  profile: ProjectProfile,
): ProjectRelevance {
  const normalized = normalizeResumeSkills(jdSkills);
  const repoTech = new Set(allTechNames(profile.technologyProfile).map((t) => t.toLowerCase()));

  const relevantAreas: ProjectRelevance['relevantAreas'] = [];
  const missingAreas: ProjectRelevance['missingAreas'] = [];
  for (const skill of normalized) {
    const key = skill.toLowerCase();
    const evidence = profile.evidence
      .filter((e) => e.claim.toLowerCase().includes(key))
      .flatMap((e) => e.files);
    if (repoTech.has(key) && evidence.length) {
      relevantAreas.push({ jdRequirement: skill, githubEvidence: unique(evidence).slice(0, 6) });
    } else if (repoTech.has(key)) {
      relevantAreas.push({ jdRequirement: skill, githubEvidence: [] });
    } else {
      missingAreas.push({
        jdRequirement: skill,
        note: `"${skill}" is required by the job description but not evidenced in this repository.`,
      });
    }
  }

  const score = normalized.length ? Math.round((relevantAreas.length / normalized.length) * 100) : 0;
  const overall: ProjectRelevance['overall'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  const summary =
    relevantAreas.length === 0
      ? `This repository does not demonstrate any of the ${normalized.length || 'required'} skills from the job description.`
      : `${relevantAreas.length} of ${normalized.length || 0} required JD skills are demonstrated by this repository (${score}%).`;

  return { overall, score, relevantAreas, missingAreas, summary };
}

// ──────────────────────────────────────────────────────────────
// ProjectProfile assembly
// ──────────────────────────────────────────────────────────────

export function buildProjectProfile(a: RepoAnalysis): ProjectProfile {
  const tech = detectTechnologyProfile(a);
  const arch = detectArchitecture(a);
  const readme = analyzeReadme(a, tech);
  const fileCategories = buildFileCategories(a.fileTree);
  const projectIndex = buildProjectIndex(a);
  const evidence = buildEvidence(tech, arch, a);
  const questions = generateProjectQuestions(tech, arch, evidence);
  const followUps = prepareFollowUpBank(questions, tech, arch.apiEndpoints);
  const scripts = extractScripts(a);

  const risks: string[] = [];
  if (!tech.testing.length) risks.push('No test framework was detected — testing posture is unclear.');
  if (!tech.devops.length) risks.push('No CI/CD or deployment configuration was detected.');
  if (a.isArchived) risks.push('This repository is archived (read-only).');
  if (!a.readme) risks.push('No README — onboarding and documentation are missing.');

  const testingStrategy = tech.testing.length
    ? [`Test frameworks: ${tech.testing.join(', ')}`]
    : ['No automated tests were detected.'];
  const deployStrategy = tech.devops.length
    ? [`Deployment/CI tooling: ${tech.devops.join(', ')}`]
    : ['No deployment configuration was detected.'];

  const summary = summarizeProjectProfile({
    fullName: a.fullName,
    description: a.description,
    primaryLanguage: a.primaryLanguage,
    languages: a.languages,
    tech,
    arch,
    readme,
  });

  return {
    repoUrl: a.url,
    fullName: a.fullName,
    owner: a.owner,
    repo: a.repo,
    description: a.description,
    homepage: a.homepage,
    primaryLanguage: a.primaryLanguage,
    license: a.license,
    stars: a.stars,
    forks: a.forks,
    openIssues: a.openIssues,
    sizeKb: a.sizeKb,
    topics: a.topics,
    isArchived: a.isArchived,
    isPrivate: a.isPrivate,
    ownerType: a.ownerType,
    defaultBranch: a.defaultBranch,
    languages: a.languages,
    languagesBreakdown: a.languagesBytes,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    pushedAt: a.pushedAt,
    analyzedAt: a.analyzedAt,
    readme,
    fileCount: a.fileTree.length,
    fileTree: a.fileTree,
    fileCategories,
    technologyProfile: tech,
    architecture: arch,
    sourceFiles: a.sourceFiles,
    configFiles: a.configFiles,
    projectIndex,
    evidence,
    apiEndpoints: arch.apiEndpoints,
    entryPoints: arch.entryPoints,
    dataModels: arch.dataModels,
    scripts,
    testingStrategy,
    deployStrategy,
    risks,
    summary,
    questions,
    followUps,
  };
}

export function buildFileCategories(tree: string[]): Record<FileCategory, string[]> {
  const out = Object.fromEntries(FILE_CATEGORIES.map((c) => [c, [] as string[]])) as Record<FileCategory, string[]>;
  for (const p of tree) {
    const c = classifyFile(p);
    out[c].push(p);
  }
  return out;
}

export function summarizeProjectProfile(input: {
  fullName: string;
  description?: string | null;
  primaryLanguage?: string | null;
  languages: string[];
  tech: TechnologyProfile;
  arch: ArchitectureProfile;
  readme: ReadmeAnalysis;
}): string {
  const lines: string[] = [];
  lines.push(`Repository: ${input.fullName}${input.description ? ` — ${input.description}` : ''}`);
  lines.push(`Primary language: ${input.primaryLanguage || 'n/a'}`);
  if (input.languages.length) lines.push(`Languages: ${input.languages.join(', ')}`);

  const t = input.tech;
  const push = (label: string, vals: string[]) => {
    if (vals.length) lines.push(`${label}: ${vals.slice(0, 10).join(', ')}`);
  };
  push('Frontend', t.frontend);
  push('Backend', t.backend);
  push('Database', t.database);
  push('Frameworks', t.frameworks);
  push('Libraries', t.libraries);
  push('DevOps', t.devops);
  push('Testing', t.testing);
  push('Other', t.other);

  const arch = input.arch;
  if (arch.patterns.length) push('Architecture', arch.patterns);
  if (arch.entryPoints.length) lines.push(`Entry points: ${arch.entryPoints.slice(0, 6).join(', ')}`);
  if (arch.apiEndpoints.length) {
    lines.push(`API endpoints (${arch.apiEndpoints.length}): ${arch.apiEndpoints.slice(0, 10).map((e) => `${e.method} ${e.path}`).join(', ')}`);
  }
  if (arch.dataModels.length) lines.push(`Data models: ${arch.dataModels.slice(0, 10).join(', ')}`);

  if (input.readme.summary) lines.push(`README summary: ${input.readme.summary.slice(0, 300)}`);
  if (input.readme.notes.length) lines.push(`README notes: ${input.readme.notes.slice(0, 3).join(' | ')}`);

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// Main analysis
// ──────────────────────────────────────────────────────────────

const defaultFetch = (url: string, init?: { headers?: Record<string, string> }) =>
  fetch(url, init) as Promise<FetchLikeResponse>;

function makeFetch(opts: AnalyzeOptions) {
  const impl = opts.fetchImpl || defaultFetch;
  return (url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<FetchLikeResponse> =>
    impl(url, { headers, ...(signal ? { signal } : {}) });
}

function errorFromInfoStatus(status: number, res: FetchLikeResponse): RepoAnalysisError | null {
  if (status === 404) {
    return new RepoAnalysisError(
      'NOT_FOUND',
      'Repository not found. Note: private repositories are not supported yet.',
      404,
    );
  }
  if (status === 429) {
    return new RepoAnalysisError(
      'RATE_LIMITED',
      'GitHub analysis is temporarily unavailable because GitHub API rate limits were reached.',
      429,
    );
  }
  if (status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      return new RepoAnalysisError(
        'RATE_LIMITED',
        'GitHub analysis is temporarily unavailable because GitHub API rate limits were reached.',
        429,
      );
    }
    return new RepoAnalysisError(
      'PRIVATE',
      'Repository not accessible. Private repositories are not supported yet.',
      403,
    );
  }
  if (status >= 500) {
    return new RepoAnalysisError('FETCH', `GitHub API error ${status}`, 502);
  }
  return new RepoAnalysisError('FETCH', `GitHub API error ${status}`, 502);
}

export async function analyzeGithubRepo(url: string, opts: AnalyzeOptions = {}): Promise<RepoAnalysis> {
  const parsed = parseRepoUrl(url);
  if (!parsed) throw new RepoAnalysisError('INVALID_URL', 'Invalid GitHub repository URL. Expected https://github.com/owner/repo', 400);
  const { owner, repo } = parsed;
  const cacheKey = `${owner}/${repo}`;
  const ttl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  const useCache = opts.useCache !== false;
  const ghFetch = makeFetch(opts);

  const cached = cache.get(cacheKey);
  if (useCache && cached && Date.now() - cached.fetchedAt < ttl) {
    return cached.detail;
  }

  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const repoUrl = `${GH_API}/repos/${encOwner}/${encRepo}`;

  let infoRes: FetchLikeResponse;
  try {
    infoRes = await ghFetch(repoUrl, HEADERS, opts.signal);
  } catch (err) {
    throw new RepoAnalysisError('FETCH', 'GitHub API unreachable', 502);
  }
  if (!infoRes.ok) {
    const statusError = errorFromInfoStatus(infoRes.status, infoRes);
    if (statusError) throw statusError;
  }

  const info = (await infoRes.json()) as {
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    default_branch: string;
    pushed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    license: { name?: string } | null;
    topics: string[];
    forks_count: number;
    open_issues_count: number;
    size: number;
    homepage: string | null;
    archived: boolean;
    private: boolean;
    owner: { type?: string };
  };

  // Pushed-at-aware reuse: the repo metadata changed => reanalyze; otherwise
  // reuse the previously cached deep analysis even past the TTL.
  if (useCache && cached && !cached.detail.isPrivate) {
    if (cached.pushedAt === (info.pushed_at ?? null)) {
      cached.fetchedAt = Date.now();
      cached.pushedAt = info.pushed_at ?? null;
      cache.set(cacheKey, cached);
      persistCache();
      return cached.detail;
    }
  }

  const defaultBranch = info.default_branch || 'main';
  const treeUrl = `${repoUrl}/git/trees/${encodeURIComponent(defaultBranch)}`;

  const [readmeRes, treeRes, langRes] = await Promise.all([
    ghFetch(`${repoUrl}/readme`, RAW_HEADERS, opts.signal).catch(() => null),
    ghFetch(`${treeUrl}?recursive=1`, HEADERS, opts.signal).catch(() => null),
    ghFetch(`${repoUrl}/languages`, HEADERS, opts.signal).catch(() => null),
  ]);

  let readme: string | null = null;
  if (readmeRes?.ok) readme = truncate(await readmeRes.text(), 6000);

  let fileTree: string[] = [];
  let treeTruncated = false;
  if (treeRes?.ok) {
    const tree = ((await treeRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> }).tree || [];
    const keepable = tree.filter(
      (e) => e.type === 'blob' && isKeepablePath(e.path) && (e.size === undefined || e.size < MAX_FILE_SIZE),
    );
    treeTruncated = keepable.length > (opts.maxTreeFiles ?? 250);
    fileTree = keepable
      .map((e) => e.path)
      .slice(0, opts.maxTreeFiles ?? 250);
  }

  const languagesBytes = langRes?.ok ? ((await langRes.json()) as Record<string, number>) : {};
  const languages = Object.keys(languagesBytes).slice(0, 8);

  const configPaths = fileTree.filter((f) => CONFIG_FILES.has(f.toLowerCase())).slice(0, 8);
  const sourceCount = Math.min(opts.sourceFileCount ?? 6, 40);
  const sourcePaths = [...fileTree]
    .filter((f) => SOURCE_EXT.test(f))
    .sort((a, b) => interestScore(b) - interestScore(a) || a.length - b.length)
    .slice(0, sourceCount);

  const readFile = async (p: string): Promise<string | null> => {
    const raw = await ghFetch(
      `${repoUrl}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(defaultBranch)}`,
      RAW_HEADERS,
      opts.signal,
    ).catch(() => null);
    return raw?.ok ? truncate(await raw.text(), 3000) : null;
  };

  const configFiles: RepoFile[] = [];
  for (const p of configPaths) {
    const content = await readFile(p);
    if (content) configFiles.push({ path: p, content });
  }
  const sourceFiles: RepoFile[] = [];
  for (const p of sourcePaths) {
    const content = await readFile(p);
    if (content) sourceFiles.push({ path: p, content });
  }

  if (!readme && configFiles.length === 0 && sourceFiles.length === 0 && fileTree.length === 0) {
    throw new RepoAnalysisError('EMPTY', 'The repository contains no analyzable content.', 422);
  }

  const combined = [
    readme || '',
    ...configFiles.map((f) => `${f.path}\n${f.content}`),
    ...sourceFiles.map((f) => `${f.path}\n${f.content}`),
    languages.join(','),
    info.description || '',
  ].join('\n');

  const deps: string[] = [];
  const pkg = configFiles.find((f) => f.path.toLowerCase() === 'package.json');
  if (pkg) {
    try {
      const parsedPkg = JSON.parse(pkg.content);
      deps.push(...Object.keys(parsedPkg.dependencies || {}), ...Object.keys(parsedPkg.devDependencies || {}));
    } catch {
      /* ignore malformed package.json */
    }
  }

  const tech = detectTech(combined, fileTree, languages, deps);

  const analysis: RepoAnalysis = {
    url,
    fullName: info.full_name,
    owner,
    repo,
    description: info.description,
    defaultBranch,
    stars: info.stargazers_count || 0,
    primaryLanguage: info.language,
    languages,
    languagesBytes,
    readme,
    fileTree,
    configFiles,
    sourceFiles,
    tech,
    profile: '',
    analyzedAt: new Date().toISOString(),
    pushedAt: info.pushed_at ?? null,
    createdAt: info.created_at ?? null,
    updatedAt: info.updated_at ?? null,
    license: info.license?.name ?? null,
    topics: info.topics || [],
    forks: info.forks_count || 0,
    openIssues: info.open_issues_count || 0,
    sizeKb: info.size || 0,
    homepage: info.homepage ?? null,
    isArchived: info.archived || false,
    isPrivate: info.private || false,
    ownerType: info.owner?.type ?? null,
  };
  analysis.profile = buildProfile(analysis);

  if (useCache) {
    cache.set(cacheKey, { fetchedAt: Date.now(), pushedAt: analysis.pushedAt, detail: analysis });
    persistCache();
  }
  return analysis;
}

/** Build a full ProjectProfile for a repo URL (deterministic, no LLM). */
export async function analyzeProject(url: string, opts: AnalyzeOptions = {}): Promise<ProjectProfile> {
  const analysis = await analyzeGithubRepo(url, {
    ...opts,
    sourceFileCount: Math.max(opts.sourceFileCount ?? 25, 10),
  });
  return buildProjectProfile(analysis);
}

export function getCachedRepoAnalysis(url: string): RepoAnalysis | null {
  const parsed = parseRepoUrl(url);
  if (!parsed) return null;
  const cached = cache.get(`${parsed.owner}/${parsed.repo}`);
  return cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS ? cached.detail : null;
}
