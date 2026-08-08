import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// Real GitHub public-API integration (profile + deep repo reads, cached).

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

interface Repo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  fork: boolean;
}

export interface RepoDetail {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  defaultBranch: string;
  languages: string[];
  readme: string | null;
  fileTree: string[];
  topFiles: Array<{ path: string; content: string }>;
}

// ──────────────────────────────────────────────────────────────
// Repo-detail cache — unauthenticated GitHub is rate-limited to
// 60 requests/hour, so a successful deep read is reused for 1h.
// ──────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { fetchedAt: number; detail: RepoDetail }>();

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      if (entry?.key && entry?.fetchedAt && entry?.detail?.name) {
        cache.set(entry.key, { fetchedAt: entry.fetchedAt, detail: entry.detail });
      }
    }
  } catch (err) {
    console.error('[GitHub] Failed to load repo cache:', (err as Error).message);
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
      console.error('[GitHub] Failed to persist repo cache:', (err as Error).message);
    }
  }, 300);
}

loadCache();

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'obj', '.git', '.github',
  '.vscode', '.idea', 'vendor', 'coverage', '.next', '.nuxt', '.venv', 'venv',
  '__pycache__', '.cache', 'assets', 'public', 'static', 'images', 'fonts',
  'icons', 'docs', 'test', 'tests', 'spec', 'e2e',
]);

const LOCK_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock)$/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|c|cpp|h|hpp|swift|scala|vue|svelte|sql)$/i;
const LOW_INTEREST = ['license', 'makefile', 'dockerfile', 'contributing', 'code_of_conduct'];
const MAX_FILE_SIZE = 200_000;

function isKeepablePath(p: string): boolean {
  const segments = p.split('/');
  if (segments.some((seg) => IGNORED_DIRS.has(seg) || seg.startsWith('.'))) return false;
  if (LOCK_FILES.test(p)) return false;
  return true;
}

function interestScore(p: string): number {
  const lower = p.toLowerCase();
  let score = 0;
  if (['src', 'lib', 'app', 'server', 'core', 'internal', 'packages'].some((d) => lower.split('/').includes(d))) score += 3;
  if (SOURCE_EXT.test(p)) score += 2;
  if (LOW_INTEREST.some((li) => lower.includes(li))) score -= 2;
  return score;
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : `${s.slice(0, max)}\n…[truncated]`;
}

function pickFromTree(tree: Array<{ path: string; type: string; size?: number }> | undefined): string[] {
  return (tree || [])
    .filter(
      (e) =>
        e.type === 'blob' &&
        isKeepablePath(e.path) &&
        (e.size === undefined || e.size < MAX_FILE_SIZE),
    )
    .sort(
      (a, b) =>
        a.path.split('/').length - b.path.split('/').length ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 250)
    .map((e) => e.path);
}

function pickTopFiles(paths: string[], count: number): string[] {
  return [...paths]
    .sort(
      (a, b) =>
        interestScore(b) - interestScore(a) ||
        a.split('/').length - b.split('/').length ||
        a.localeCompare(b),
    )
    .slice(0, count);
}

// ──────────────────────────────────────────────────────────────
// GET /api/github/:username — real public GitHub profile lookup (no key needed)
// ──────────────────────────────────────────────────────────────
router.get('/:username', async (req: Request, res: Response) => {
  const username = (req.params.username || '').trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    return res.status(400).json({ success: false, error: 'Invalid GitHub username' });
  }

  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`${GH_API}/users/${username}`, { headers: HEADERS }),
      fetch(`${GH_API}/users/${username}/repos?per_page=100&sort=updated`, { headers: HEADERS }),
    ]);

    if (userRes.status === 404) {
      return res.status(404).json({ success: false, error: `GitHub user "${username}" not found` });
    }
    if (!userRes.ok) {
      return res.status(502).json({ success: false, error: `GitHub API error ${userRes.status}` });
    }

    const user = (await userRes.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      bio: string | null;
      followers?: number;
      public_repos?: number;
    };
    const repos: Repo[] = reposRes.ok ? ((await reposRes.json()) as Repo[]) : [];

    const langCount = new Map<string, number>();
    let totalStars = 0;
    for (const r of repos) {
      if (r.language) langCount.set(r.language, (langCount.get(r.language) || 0) + 1);
      if (!r.fork) totalStars += r.stargazers_count || 0;
    }

    const topLanguages = Array.from(langCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([lang]) => lang);

    const topRepos = repos
      .filter((r) => !r.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        url: r.html_url,
      }));

    res.json({
      success: true,
      data: {
        username: user.login,
        name: user.name || user.login,
        avatar: user.avatar_url,
        bio: user.bio || '',
        followers: user.followers ?? 0,
        publicRepos: user.public_repos ?? 0,
        topLanguages,
        topRepos,
        totalStars,
      },
    });
  } catch (err) {
    console.error('[GitHub] lookup failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'GitHub API unreachable' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/github/:username/:repo — deep repo detail: README +
// file tree + top source-file contents, cached for 1 hour.
// Used to feed the AI real code for Project-mode discussions.
// ──────────────────────────────────────────────────────────────
router.get('/:username/:repo', async (req: Request, res: Response) => {
  const username = (req.params.username || '').trim();
  const repo = (req.params.repo || '').trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo)) {
    return res.status(400).json({ success: false, error: 'Invalid GitHub username or repo name' });
  }

  const cacheKey = `${username}/${repo}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json({ success: true, data: cached.detail, cached: true });
  }

  const encUser = encodeURIComponent(username);
  const encRepo = encodeURIComponent(repo);
  const repoUrl = `${GH_API}/repos/${encUser}/${encRepo}`;
  const ghFetch = (url: string, headers: Record<string, string>) => fetch(url, { headers });

  try {
    const infoRes = await ghFetch(repoUrl, HEADERS);
    if (infoRes.status === 404) {
      return res.status(404).json({ success: false, error: `Repo "${username}/${repo}" not found` });
    }
    if (!infoRes.ok) {
      return res.status(502).json({ success: false, error: `GitHub API error ${infoRes.status}` });
    }

    const info = (await infoRes.json()) as {
      name: string;
      full_name: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      default_branch: string;
    };
    const defaultBranch = info.default_branch || 'main';
    const treeUrl = `${repoUrl}/git/trees/${encodeURIComponent(defaultBranch)}`;

    const [readmeRes, treeRes, langRes] = await Promise.all([
      ghFetch(`${repoUrl}/readme`, RAW_HEADERS).catch(() => null),
      ghFetch(`${treeUrl}?recursive=1`, HEADERS).catch(() => null),
      ghFetch(`${repoUrl}/languages`, HEADERS).catch(() => null),
    ]);

    let readme: string | null = null;
    if (readmeRes?.ok) {
      readme = truncate(await readmeRes.text(), 6000);
    }

    let fileTree: string[] = [];
    if (treeRes?.ok) {
      fileTree = pickFromTree(((await treeRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> }).tree);
    } else {
      // Recursive tree too large — fall back to the shallow root tree.
      const shallowRes = await ghFetch(treeUrl, HEADERS).catch(() => null);
      if (shallowRes?.ok) {
        fileTree = pickFromTree(((await shallowRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> }).tree);
      }
    }

    const languages = langRes?.ok
      ? Object.keys((await langRes.json()) as Record<string, number>).slice(0, 8)
      : [];

    const topFiles: RepoDetail['topFiles'] = [];
    for (const p of pickTopFiles(fileTree, 3)) {
      const raw = await ghFetch(
        `${repoUrl}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(defaultBranch)}`,
        RAW_HEADERS,
      ).catch(() => null);
      if (raw?.ok) {
        topFiles.push({ path: p, content: truncate(await raw.text(), 2500) });
      }
    }

    const detail: RepoDetail = {
      name: info.name,
      fullName: info.full_name,
      description: info.description,
      language: info.language,
      stars: info.stargazers_count || 0,
      defaultBranch,
      languages,
      readme,
      fileTree,
      topFiles,
    };

    cache.set(cacheKey, { fetchedAt: Date.now(), detail });
    persistCache();

    res.json({ success: true, data: detail, cached: false });
  } catch (err) {
    console.error('[GitHub] repo detail failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'GitHub API unreachable' });
  }
});

export default router;
