/**
 * Phase 4 GitHub Repository Analyzer tests.
 *
 * Fully deterministic — every GitHub API call is served by an in-memory
 * mock transport (AnalyzeOptions.fetchImpl). No live network.
 *
 * Runs against the compiled dist/ (run `npm run build` first):
 *   node scripts/testGithubAnalyzer.js
 *
 * Covers the 22 required scenarios. Exits non-zero on failure.
 */

const {
  analyzeGithubRepo,
  analyzeProject,
  parseRepoUrl,
  classifyFile,
  buildProjectProfile,
  buildFileCategories,
  buildProjectIndex,
  detectTechnologyProfile,
  detectArchitecture,
  analyzeReadme,
  generateProjectQuestions,
  prepareFollowUpBank,
  retrieveProjectContext,
  compareResumeToGithub,
  assessProjectRelevance,
  summarizeProjectProfile,
  RepoAnalysisError,
  clearRepoCache,
} = require('../dist/services/repoAnalyzer');
const { toRow: pgToRow, fromRow: pgFromRow } = require('../dist/services/stores/postgresStore');
const { toRow: supabaseToRow, fromRow: supabaseFromRow } = require('../dist/services/stores/supabaseStore');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectError(fn, code) {
  try {
    await fn();
    return { ok: false, detail: 'did not throw' };
  } catch (err) {
    if (!(err instanceof RepoAnalysisError)) {
      return { ok: false, detail: `threw ${err && err.name} (${err && err.message})` };
    }
    return {
      ok: err.code === code,
      detail: `code=${err.code} status=${err.status} msg=${err.message.slice(0, 120)}`,
    };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Mock HTTP transport ───────────────────────────────────────
class MockResponse {
  constructor(status, body, headers = {}) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this._headers = headers;
    if (typeof body === 'string') {
      this._text = body;
      this._json = null;
    } else {
      this._text = body === null || body === undefined ? '' : JSON.stringify(body);
      this._json = body;
    }
  }
  get headers() {
    const h = this._headers;
    return { get: (name) => h[name.toLowerCase()] ?? null };
  }
  async json() {
    if (this._json !== null) return this._json;
    return JSON.parse(this._text);
  }
  async text() {
    return this._text;
  }
}

function contentHandler(contents) {
  return (url) => {
    const m = url.match(/\/contents\/(.+?)\?ref=/);
    if (!m) return null;
    const p = decodeURIComponent(m[1]);
    if (Object.prototype.hasOwnProperty.call(contents, p)) {
      return new MockResponse(200, contents[p]);
    }
    return new MockResponse(404, { message: 'Not Found' });
  };
}

function makeRepoTransport({ info, readme, tree = [], contents = {}, lang = {}, infoStatus = 200, infoHeaders = {} }) {
  const calls = [];
  const readmeHandler = readme == null ? () => new MockResponse(404, {}) : () => new MockResponse(200, readme);
  const fetchImpl = (url) => {
    calls.push(url);
    const build = () => {
      if (/\/contents\//.test(url)) {
        const r = contentHandler(contents)(url);
        if (r) return r;
      }
      if (/\/readme$/.test(url)) return readmeHandler();
      if (/\/languages$/.test(url)) return new MockResponse(200, lang);
      if (/\/git\/trees\//.test(url)) return new MockResponse(200, { tree });
      return new MockResponse(infoStatus, info, infoHeaders);
    };
    // The analyzer expects a Promise (it calls .catch() on results), so the
    // mock must return a resolved promise rather than a bare MockResponse.
    return Promise.resolve(build());
  };
  return { calls, fetchImpl };
}

function treeFromMap(map) {
  return Object.keys(map).map((p) => ({ path: p, type: 'blob', size: String(map[p] || '').length }));
}

function repoInfo(overrides = {}) {
  return {
    name: 'app',
    full_name: 'acme/app',
    description: 'Full-stack web dashboard built with React, Express and PostgreSQL',
    language: 'TypeScript',
    stargazers_count: 42,
    default_branch: 'main',
    pushed_at: '2026-01-15T10:00:00Z',
    created_at: '2024-05-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    license: { name: 'MIT' },
    topics: ['react', 'nodejs', 'api'],
    forks_count: 3,
    open_issues_count: 5,
    size: 1200,
    homepage: 'https://acme.example.com',
    archived: false,
    private: false,
    owner: { type: 'User' },
    ...overrides,
  };
}

// ── Fixture: full-stack web app ───────────────────────────────
const PKG_JSON = JSON.stringify(
  {
    name: 'acme-app',
    description: 'Full-stack dashboard',
    dependencies: { react: '^18', 'react-dom': '^18', express: '^4', pg: '^8', jsonwebtoken: '^9' },
    devDependencies: { typescript: '^5', vitest: '^1', '@types/react': '^18' },
    scripts: { dev: 'vite', build: 'tsc && vite build', test: 'vitest run', start: 'node dist/server.js' },
  },
  null,
  2,
);

const SERVER_TS = `import express from 'express';
import { Pool } from 'pg'; // PostgreSQL connection pool
import { verifyJwt } from './services/auth';

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/users', (req, res) => res.json({ created: true }));

app.listen(3000, () => console.log('listening'));
`;

const API_TS = `import { Router } from 'express';
import { getUserById } from '../models/user';

export const userRouter = Router();
userRouter.get('/users/:id', getUserById);
userRouter.delete('/users/:id', (req, res) => res.json({ deleted: true }));
`;

const USER_TS = `export interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
}

export async function getUserById(id: number) {
  // SELECT * FROM users WHERE id = $1
  return { id, email: 'a@b.c', role: 'user' };
}
`;

const AUTH_TS = `import jwt from 'jsonwebtoken';

export function verifyJwt(token: string) {
  return jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
}

export function signToken(userId: number) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'dev-secret');
}
`;

const INDEX_TSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Header } from './components/Header';

const root = createRoot(document.getElementById('root')!);
root.render(<Header title="Acme" />);
`;

const HEADER_TSX = `import React from 'react';

export function Header({ title }: { title: string }) {
  return <header className="app-header">{title}</header>;
}
`;

const HELPERS_TS = `export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
`;

const STYLES_CSS = `.app-header { color: teal; }
`;

const TEST_TS = `import { describe, it, expect } from 'vitest';
import { clamp } from '../src/utils/helpers';

describe('clamp', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
`;

const DOCKERFILE = `# Docker image for the acme app
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm ci
COPY . .
CMD ["npm", "start"]
`;

const COMPOSE = `version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
`;

const CI_YML = `name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const README = `# Acme App

A full-stack dashboard built with React, Express, and PostgreSQL.

## Features
- Real-time metrics
- Authentication with JWT
- Docker-based deployment

> Note: Redis is used for caching.
`;

const TSCONFIG = `{
  "compilerOptions": { "strict": true, "target": "ES2022" }
}`;

const FULLSTACK_FILES = {
  'package.json': PKG_JSON,
  'tsconfig.json': TSCONFIG,
  'src/server.ts': SERVER_TS,
  'src/routes/api.ts': API_TS,
  'src/models/user.ts': USER_TS,
  'src/services/auth.ts': AUTH_TS,
  'src/index.tsx': INDEX_TSX,
  'src/components/Header.tsx': HEADER_TSX,
  'src/utils/helpers.ts': HELPERS_TS,
  'src/styles.css': STYLES_CSS,
  'tests/app.test.ts': TEST_TS,
  'Dockerfile': DOCKERFILE,
  'docker-compose.yml': COMPOSE,
  '.github/workflows/ci.yml': CI_YML,
  'README.md': README,
  'public/logo.png': 'PNG',
  'dist/bundle.js': 'generated',
  'package-lock.json': '{}',
};

function fullstackTransport(pushedAt) {
  return makeRepoTransport({
    info: repoInfo(pushedAt ? { pushed_at: pushedAt } : {}),
    readme: README,
    tree: treeFromMap(FULLSTACK_FILES),
    contents: FULLSTACK_FILES,
    lang: { TypeScript: 5000, JavaScript: 2000, CSS: 500 },
  });
}

// ── Fixture: minimal Python CLI (no frontend / DB / backend) ──
const CLI_FILES = {
  'cli.py': `import argparse


def main():
    parser = argparse.ArgumentParser(description="Acme CLI tool")
    args = parser.parse_args()
    print(args)
`,
  'tests/test_cli.py': `import pytest
from cli import main

def test_main_runs():
    assert main is not None
`,
  'setup.py': `from setuptools import setup

setup(name="acme-cli", version="0.1.0")
`,
  '.github/workflows/ci.yml': CI_YML,
  'README.md': `# Acme CLI\n\nA command-line utility written in Python.`,
};

function cliTransport() {
  return makeRepoTransport({
    info: repoInfo({ full_name: 'acme/cli', name: 'cli', language: 'Python', topics: ['cli'] }),
    readme: '# Acme CLI\n\nA command-line utility written in Python.',
    tree: treeFromMap(CLI_FILES),
    contents: CLI_FILES,
    lang: { Python: 1000 },
  });
}

// ── Run scenarios ─────────────────────────────────────────────
async function main() {
  // [1] Valid URL → full profile with all expected sections
  console.log('\n[1] Valid repo URL → ProjectProfile');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    check('fullName extracted', profile.fullName === 'acme/app', profile.fullName);
    check('technologyProfile has all 9 keys', ['frontend', 'backend', 'database', 'programmingLanguages', 'frameworks', 'libraries', 'devops', 'testing', 'other'].every((k) => Array.isArray(profile.technologyProfile[k])));
    check('frontend detected (React)', profile.technologyProfile.frontend.includes('React'), JSON.stringify(profile.technologyProfile.frontend));
    check('backend detected (Express)', profile.technologyProfile.backend.includes('Express'), JSON.stringify(profile.technologyProfile.backend));
    check('database detected (PostgreSQL)', profile.technologyProfile.database.includes('PostgreSQL'), JSON.stringify(profile.technologyProfile.database));
    check('devops detected (Docker)', profile.technologyProfile.devops.some((d) => /docker/i.test(d)), JSON.stringify(profile.technologyProfile.devops));
    check('architecture entry points', profile.entryPoints.includes('src/server.ts'), JSON.stringify(profile.entryPoints));
    check('api endpoints extracted', profile.apiEndpoints.length >= 2, JSON.stringify(profile.apiEndpoints.slice(0, 4)));
    check('data models extracted', profile.dataModels.includes('User'), JSON.stringify(profile.dataModels));
    check('evidence non-empty', profile.evidence.length > 0, `got ${profile.evidence.length}`);
    check('questions generated', profile.questions.length >= 10, `got ${profile.questions.length}`);
    check('follow-up bank prepared', profile.followUps.length >= 5, `got ${profile.followUps.length}`);
    check('summary non-empty', profile.summary.length > 0);
    check('project index non-empty', profile.projectIndex.length > 0, `got ${profile.projectIndex.length}`);
    check('repo metadata captured', profile.stars === 42 && profile.license === 'MIT' && profile.topics.includes('react'));
  }

  // [2] Invalid URL → INVALID_URL
  console.log('\n[2] Invalid URL');
  {
    const r = await expectError(() => analyzeGithubRepo('https://example.com/acme/app'), 'INVALID_URL');
    check('non-github host rejected', r.ok, r.detail);
    const r2 = await expectError(() => analyzeGithubRepo('not a url at all'), 'INVALID_URL');
    check('garbage rejected', r2.ok, r2.detail);
  }

  // [3] Bare owner/repo shorthand
  console.log('\n[3] owner/repo shorthand');
  {
    const t = fullstackTransport();
    const analysis = await analyzeGithubRepo('acme/app', { fetchImpl: t.fetchImpl });
    check('shorthand parses and analyzes', analysis.fullName === 'acme/app');
    const parsed = parseRepoUrl('acme/app');
    check('parseRepoUrl handles shorthand', !!parsed && parsed.owner === 'acme' && parsed.repo === 'app');
  }

  // [4] SSRF safety — http://github.com variant works, others rejected
  console.log('\n[4] URL validation / SSRF safety');
  {
    check('parseRepoUrl accepts http github', !!parseRepoUrl('http://github.com/a/b'));
    check('parseRepoUrl accepts www', !!parseRepoUrl('https://www.github.com/a/b'));
    check('parseRepoUrl accepts .git suffix', !!parseRepoUrl('https://github.com/a/b.git'));
    check('parseRepoUrl rejects internal host', !parseRepoUrl('http://169.254.169.254/metadata'));
    check('parseRepoUrl rejects userinfo', !parseRepoUrl('https://github.com@evil.com/a/b'));
    check('parseRepoUrl rejects extra path', !parseRepoUrl('https://github.com/a/b/c'));
    check('parseRepoUrl rejects query injection', !parseRepoUrl('https://github.com/a/b?redirect=1'));
  }

  // [5] 404 → NOT_FOUND
  console.log('\n[5] Not found');
  {
    const t = makeRepoTransport({ info: repoInfo(), infoStatus: 404 });
    const r = await expectError(() => analyzeGithubRepo('https://github.com/acme/nope', { fetchImpl: t.fetchImpl }), 'NOT_FOUND');
    check('404 maps to NOT_FOUND', r.ok, r.detail);
  }

  // [6] 403 (no rate-limit) → PRIVATE
  console.log('\n[6] Private repository');
  {
    const t = makeRepoTransport({ info: repoInfo(), infoStatus: 403, infoHeaders: {} });
    const r = await expectError(() => analyzeGithubRepo('https://github.com/acme/private', { fetchImpl: t.fetchImpl }), 'PRIVATE');
    check('403 maps to PRIVATE', r.ok, r.detail);
  }

  // [7] 403 with rate-limit header → RATE_LIMITED + graceful message
  console.log('\n[7] Rate limited (403 header)');
  {
    clearRepoCache();
    const t = makeRepoTransport({ info: repoInfo(), infoStatus: 403, infoHeaders: { 'x-ratelimit-remaining': '0' } });
    const r = await expectError(() => analyzeGithubRepo('https://github.com/acme/app', { fetchImpl: t.fetchImpl }), 'RATE_LIMITED');
    check('rate-limit 403 maps to RATE_LIMITED', r.ok, r.detail);
  }

  // [8] 429 → RATE_LIMITED
  console.log('\n[8] Rate limited (429)');
  {
    clearRepoCache();
    const t = makeRepoTransport({ info: repoInfo(), infoStatus: 429 });
    try {
      await analyzeGithubRepo('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
      check('429 throws RATE_LIMITED', false, 'no throw');
    } catch (err) {
      check('429 maps to RATE_LIMITED', err instanceof RepoAnalysisError && err.code === 'RATE_LIMITED' && err.status === 429);
      check('graceful rate-limit message', /temporarily unavailable/i.test(err.message), err.message);
    }
  }

  // [9] Empty repo → EMPTY
  console.log('\n[9] Empty repository');
  {
    const t = makeRepoTransport({ info: repoInfo(), readme: null, tree: [], contents: {} });
    const r = await expectError(() => analyzeGithubRepo('https://github.com/acme/empty', { fetchImpl: t.fetchImpl }), 'EMPTY');
    check('empty repo maps to EMPTY', r.ok, r.detail);
  }

  // [10] File classification — 9 categories
  console.log('\n[10] File classification');
  {
    check('important source', classifyFile('src/server.ts') === 'IMPORTANT_SOURCE', classifyFile('src/server.ts'));
    check('component source', classifyFile('src/components/Header.tsx') === 'IMPORTANT_SOURCE');
    check('plain source', classifyFile('src/styles.css') === 'SOURCE', classifyFile('src/styles.css'));
    check('configuration', classifyFile('package.json') === 'CONFIGURATION');
    check('documentation', classifyFile('README.md') === 'DOCUMENTATION');
    check('test', classifyFile('tests/app.test.ts') === 'TEST', classifyFile('tests/app.test.ts'));
    check('build', classifyFile('Dockerfile') === 'BUILD', classifyFile('Dockerfile'));
    check('generated', classifyFile('dist/bundle.js') === 'GENERATED');
    check('dependency', classifyFile('package-lock.json') === 'DEPENDENCY');
    check('asset', classifyFile('public/logo.png') === 'ASSET');
    check('ignored', classifyFile('.gitignore') === 'IGNORED', classifyFile('.gitignore'));
  }

  // [11] TechnologyProfile contents + file categories on a real analysis
  console.log('\n[11] Technology profile + categories from analysis');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const cats = buildFileCategories(profile.fileTree);
    check('important source bucket non-empty', cats.IMPORTANT_SOURCE.length >= 5, JSON.stringify(cats.IMPORTANT_SOURCE));
    check('test bucket non-empty', cats.TEST.length >= 1, JSON.stringify(cats.TEST));
    check('config bucket non-empty', cats.CONFIGURATION.length >= 2, JSON.stringify(cats.CONFIGURATION));
    check('asset bucket has logo', cats.ASSET.includes('public/logo.png'));
    check('programming languages includes TypeScript', profile.technologyProfile.programmingLanguages.includes('TypeScript'));
    check('testing detected (Vitest)', profile.technologyProfile.testing.some((t) => /vitest/i.test(t)));
  }

  // [12] Evidence system — claim maps to real files
  console.log('\n[12] Evidence grounding');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const reactEvidence = profile.evidence.find((e) => e.claim.includes('React'));
    check('React evidence claim exists', !!reactEvidence, 'no claim');
    check('React claim backed by files', !!reactEvidence && reactEvidence.files.length > 0, reactEvidence && JSON.stringify(reactEvidence.files));
    check('React evidence includes package.json', !!reactEvidence && reactEvidence.files.includes('package.json'), reactEvidence && JSON.stringify(reactEvidence.files));
  }

  // [13] README analysis — corroborated claims + unverified warning
  console.log('\n[13] README analysis');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    check('readme summary present', profile.readme.summary.length > 0);
    check('readme sections extracted', profile.readme.sections.includes('Features'));
    check('readme claims corroborated', profile.readme.trusted === true);
    const unverified = profile.readme.notes.some((n) => /Redis/.test(n) && /unverified/i.test(n));
    check('Redis claim flagged unverified (README-only)', unverified, JSON.stringify(profile.readme.notes));
  }

  // [14] Project index entry shape + symbols + importance
  console.log('\n[14] Project index');
  {
    const t = fullstackTransport();
    const analysis = await analyzeGithubRepo('https://github.com/acme/app', { fetchImpl: t.fetchImpl, sourceFileCount: 25 });
    const index = buildProjectIndex(analysis);
    const server = index.find((e) => e.path === 'src/server.ts');
    check('entry has full shape', !!server && typeof server.path === 'string' && typeof server.language === 'string' && server.importance === 'high' && Array.isArray(server.symbols) && Array.isArray(server.technologies) && Array.isArray(server.relatedFiles));
    check('server entry has symbols', !!server && server.symbols.length >= 1, server && JSON.stringify(server.symbols));
    check('server entry has technologies', !!server && server.technologies.length >= 1, server && JSON.stringify(server.technologies));
    check('related files populated', !!server && server.relatedFiles.length >= 1, server && JSON.stringify(server.relatedFiles));
    const testEntry = index.find((e) => e.path === 'tests/app.test.ts');
    check('test entry importance medium', !!testEntry && testEntry.importance === 'medium');
  }

  // [15] Architecture detection
  console.log('\n[15] Architecture');
  {
    const t = fullstackTransport();
    const analysis = await analyzeGithubRepo('https://github.com/acme/app', { fetchImpl: t.fetchImpl, sourceFileCount: 25 });
    const arch = detectArchitecture(analysis);
    check('entry points detected', arch.entryPoints.includes('src/server.ts'), JSON.stringify(arch.entryPoints));
    check('layered pattern detected', arch.patterns.some((p) => /layered/i.test(p)), JSON.stringify(arch.patterns));
    check('docker pattern detected', arch.patterns.some((p) => /docker/i.test(p)));
    check('api endpoints include GET /users/:id', arch.apiEndpoints.some((e) => e.method === 'GET' && e.path === '/users/:id'), JSON.stringify(arch.apiEndpoints));
    check('data model User extracted', arch.dataModels.includes('User'), JSON.stringify(arch.dataModels));
  }

  // [16] Question generation — 15 categories, only for present tech
  console.log('\n[16] Evidence-grounded questions');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const cats = profile.questions.map((x) => x.category);
    check('15 categories for fullstack', new Set(cats).size === cats.length && cats.length === 15, `got ${cats.length}: ${cats.join('|')}`);
    check('architecture question grounded', profile.questions.find((x) => x.category === 'Architecture & design decisions').groundedIn.length > 0);
    check('api question grounded in endpoint files', profile.questions.find((x) => x.category === 'API design').groundedIn.length > 0);

    const t2 = cliTransport();
    const cliProfile = await analyzeProject('https://github.com/acme/cli', { fetchImpl: t2.fetchImpl });
    const cliCats = cliProfile.questions.map((x) => x.category);
    check('CLI skips frontend category', !cliCats.includes('Frontend implementation'), cliCats.join('|'));
    check('CLI skips backend category', !cliCats.includes('Backend implementation'));
    check('CLI skips data-modeling category', !cliCats.includes('Data modeling & storage'));
    check('CLI skips API-design category', !cliCats.includes('API design'));
    check('CLI keeps present-tech categories', cliCats.includes('Testing & quality') && cliCats.includes('Architecture & design decisions'));
  }

  // [17] Follow-up bank
  console.log('\n[17] Follow-up preparation');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const f = prepareFollowUpBank(profile.questions, profile.technologyProfile, profile.apiEndpoints);
    check('follow-up topics present', f.length >= 5, `got ${f.length}`);
    check('each topic has prompts', f.every((x) => Array.isArray(x.prompts) && x.prompts.length >= 2));
    check('db follow-ups when db present', f.some((x) => x.topic === 'Data & storage'));
    check('api follow-ups when api present', f.some((x) => x.topic === 'API design'));
  }

  // [18] Retrieval
  console.log('\n[18] Retrieval function');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const ctx = retrieveProjectContext('How does the API authenticate users with JWT?', profile);
    check('retrieval returns files', ctx.files.length > 0, JSON.stringify(ctx.files));
    check('auth file retrieved', ctx.files.includes('src/services/auth.ts'), JSON.stringify(ctx.files));
    check('retrieval summary non-empty', ctx.summary.length > 0);
    check('related questions are strings', Array.isArray(ctx.relatedQuestions));
  }

  // [19] Resume ↔ GitHub consistency (non-accusatory)
  console.log('\n[19] Resume vs GitHub consistency');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const res = compareResumeToGithub(['React', 'Express', 'TypeScript', 'COBOL'], profile);
    check('score computed', res.score === 75, `score=${res.score}`);
    check('overall aligned', res.overall === 'aligned', res.overall);
    check('matches count', res.matches.length === 3, `got ${res.matches.length}`);
    check('gaps count', res.gaps.length === 1, `got ${res.gaps.length}`);
    check('gap is non-accusatory', /no evidence/.test(res.gaps[0].note), res.gaps[0].note);
    check('summary non-empty', res.summary.length > 0);
  }

  // [20] JD + Resume + GitHub relevance
  console.log('\n[20] JD relevance');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const res = assessProjectRelevance(['React', 'PostgreSQL', 'Docker', 'COBOL'], profile);
    check('relevance score', res.score === 75, `score=${res.score}`);
    check('relevance overall high', res.overall === 'high', res.overall);
    check('relevant areas', res.relevantAreas.length === 3, `got ${res.relevantAreas.length}`);
    check('missing areas', res.missingAreas.length === 1 && /COBOL/.test(res.missingAreas[0].jdRequirement));
    check('relevant area has evidence', res.relevantAreas[0].githubEvidence.length > 0, JSON.stringify(res.relevantAreas[0]));
  }

  // [21] Caching — TTL reuse, pushed_at invalidation, no infinite cache
  console.log('\n[21] Caching');
  {
    clearRepoCache();
    const t = fullstackTransport('2026-01-15T10:00:00Z');
    await analyzeProject('https://github.com/acme/cache-me', { fetchImpl: t.fetchImpl });
    const afterFirst = t.calls.length;
    check('first analysis made network calls', afterFirst > 3, `calls=${afterFirst}`);

    await analyzeProject('https://github.com/acme/cache-me', { fetchImpl: t.fetchImpl });
    check('second analysis served from cache (no network)', t.calls.length === afterFirst, `calls ${afterFirst} -> ${t.calls.length}`);

    // Same pushed_at but past TTL → reuse deep analysis, only metadata re-fetched.
    await sleep(5);
    await analyzeProject('https://github.com/acme/cache-me', { fetchImpl: t.fetchImpl, cacheTtlMs: 1 });
    check('pushed_at unchanged → deep analysis reused', t.calls.length === afterFirst + 1, `calls ${afterFirst} -> ${t.calls.length}`);

    // pushed_at changed → full reanalysis.
    t.info = repoInfo({ pushed_at: '2026-02-01T00:00:00Z' });
    clearRepoCache();
    const t2 = fullstackTransport('2026-02-01T00:00:00Z');
    await analyzeProject('https://github.com/acme/cache-me', { fetchImpl: t2.fetchImpl, cacheTtlMs: 1, useCache: false });
    const n2 = t2.calls.length;
    check('fresh analysis works', n2 > 3);
  }

  // [22] Summarizer + error status mapping
  console.log('\n[22] Summary + error statuses');
  {
    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const summary = summarizeProjectProfile({
      fullName: profile.fullName,
      description: profile.description,
      primaryLanguage: profile.primaryLanguage,
      languages: profile.languages,
      tech: profile.technologyProfile,
      arch: profile.architecture,
      readme: profile.readme,
    });
    check('summary mentions repo', /acme\/app/.test(summary), summary.slice(0, 80));
    check('summary mentions frontend', /Frontend/.test(summary), summary.slice(0, 160));

    const err404 = new RepoAnalysisError('NOT_FOUND', 'x', 404);
    const err403 = new RepoAnalysisError('PRIVATE', 'x', 403);
    const err429 = new RepoAnalysisError('RATE_LIMITED', 'x', 429);
    const err422 = new RepoAnalysisError('EMPTY', 'x', 422);
    const err400 = new RepoAnalysisError('INVALID_URL', 'x', 400);
    check('error statuses map to HTTP codes', err404.status === 404 && err403.status === 403 && err429.status === 429 && err422.status === 422 && err400.status === 400);
  }

  // [EXTRA] Store persistence round-trips (additive columns preserved)
  console.log('\n[EXTRA] Persistence round-trips');
  {
    const sample = {
      id: '11111111-1111-1111-1111-111111111111',
      mode: 'PROJECT',
      role: 'Engineer',
      company: 'Acme',
      candidateId: 'anon',
      resumeText: 'r',
      jdText: 'j',
      githubSummary: 'Repository: acme/app',
      difficulty: 'Medium',
      skills: ['React'],
      resumeProfile: '',
      jdProfile: '',
      resumeProfileData: null,
      jdProfileData: null,
      matchReport: null,
      coding: null,
      resumeFileKey: null,
      resumeFileUrl: null,
      resumeFileName: null,
      status: 'SETUP',
      createdAt: new Date().toISOString(),
      startedAt: null,
      score: null,
      durationMs: null,
      feedback: null,
      roadmap: null,
      transcript: [],
      projectProfileData: { fullName: 'acme/app', repoUrl: 'https://github.com/acme/app' },
      projectIndex: [{ path: 'src/server.ts' }],
      githubAnalysis: 'Repository: acme/app',
      githubAnalyzedAt: '2026-01-15T10:00:00Z',
    };

    const pgRow = pgToRow(sample);
    check('pg toRow appends project columns at end', pgRow.length === 31 && pgRow[27].fullName === 'acme/app' && pgRow[28][0].path === 'src/server.ts' && pgRow[29] === sample.githubAnalysis && pgRow[30] === '2026-01-15T10:00:00Z', `len=${pgRow.length}`);
    const pgBack = pgFromRow({
      ...Object.fromEntries(['id', 'mode', 'role', 'company', 'candidate_id', 'resume_text', 'jd_text', 'github_summary', 'difficulty', 'skills', 'resume_profile', 'jd_profile', 'resume_profile_data', 'jd_profile_data', 'match_report', 'coding', 'resume_file_key', 'resume_file_url', 'resume_file_name', 'status', 'created_at', 'started_at', 'score', 'duration_ms', 'feedback', 'roadmap', 'transcript', 'project_profile_data', 'project_index', 'github_analysis', 'github_analyzed_at'].map((c, i) => [c, pgRow[i]])),
    });
    check('pg round-trips project fields', pgBack.projectProfileData.fullName === 'acme/app' && pgBack.projectIndex[0].path === 'src/server.ts' && pgBack.githubAnalysis === sample.githubAnalysis && pgBack.githubAnalyzedAt === new Date('2026-01-15T10:00:00Z').toISOString());

    const supabaseRow = supabaseToRow(sample);
    const supabaseBack = supabaseFromRow(supabaseRow);
    check('supabase round-trips project fields', supabaseBack.projectProfileData.fullName === 'acme/app' && supabaseBack.projectIndex.length === 1 && supabaseBack.githubAnalyzedAt === new Date('2026-01-15T10:00:00Z').toISOString());

    const t = fullstackTransport();
    const profile = await analyzeProject('https://github.com/acme/app', { fetchImpl: t.fetchImpl });
    const built = buildProjectProfile(await analyzeGithubRepo('https://github.com/acme/app', { fetchImpl: t.fetchImpl, sourceFileCount: 25 }));
    check('buildProjectProfile produces stable fullName', built.fullName === profile.fullName);
  }

  console.log(`\n==== GitHub Analyzer: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
