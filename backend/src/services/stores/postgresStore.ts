import { Pool } from 'pg';
import { SessionStore } from '../sessionStore';

// ──────────────────────────────────────────────────────────────
// Postgres persistence (Supabase/Neon/any PG).
// Maps the in-memory session record to the `sessions` table.
// ──────────────────────────────────────────────────────────────

export const SCHEMA_SQL = `
  create table if not exists sessions (
    id             uuid primary key,
    mode           text not null default 'CODING',
    role           text not null default 'Software Engineer',
    company        text not null default 'Unknown',
    candidate_id   text not null default 'anonymous',
    resume_text    text not null default '',
    jd_text        text not null default '',
    github_summary text not null default '',
    difficulty     text not null default 'Medium',
    skills         jsonb not null default '[]'::jsonb,
    resume_profile text not null default '',
    jd_profile     text not null default '',
    resume_profile_data jsonb,
    jd_profile_data     jsonb,
    match_report        jsonb,
    coding         jsonb,
    coding_interview jsonb,
    resume_file_key text,
    resume_file_url text,
    resume_file_name text,
    status         text not null default 'SETUP',
    created_at     timestamptz not null default now(),
    started_at     timestamptz,
    score          integer,
    duration_ms    bigint,
    feedback       jsonb,
    roadmap        jsonb,
    transcript     jsonb not null default '[]'::jsonb,
    project_profile_data jsonb,
    project_index        jsonb,
    github_analysis      text not null default '',
    github_analyzed_at   timestamptz
  );
  create index if not exists sessions_status_idx on sessions (status);
  create index if not exists sessions_created_at_idx on sessions (created_at desc);
  -- Upgrade path for tables created before the Phase 2 columns existed
  -- (create table if not exists never adds columns to an existing table).
  alter table sessions add column if not exists difficulty     text not null default 'Medium';
  alter table sessions add column if not exists skills         jsonb not null default '[]'::jsonb;
  alter table sessions add column if not exists resume_profile text not null default '';
  alter table sessions add column if not exists jd_profile     text not null default '';
  alter table sessions add column if not exists resume_profile_data jsonb;
  alter table sessions add column if not exists jd_profile_data     jsonb;
  alter table sessions add column if not exists match_report        jsonb;
  alter table sessions add column if not exists coding              jsonb;
  alter table sessions add column if not exists coding_interview    jsonb;
  alter table sessions add column if not exists resume_file_key  text;
  alter table sessions add column if not exists resume_file_url  text;
  alter table sessions add column if not exists resume_file_name text;
  -- Phase 4: GitHub project-profile columns (additive).
  alter table sessions add column if not exists project_profile_data jsonb;
  alter table sessions add column if not exists project_index        jsonb;
  alter table sessions add column if not exists github_analysis      text not null default '';
  alter table sessions add column if not exists github_analyzed_at   timestamptz;
  -- Phase 7: auth ownership (user_id) + voice metadata (additive, appended so
  -- positional UPSERT param order is untouched).
  alter table sessions add column if not exists user_id uuid;
  alter table sessions add column if not exists voice jsonb;
`;

const UPSERT_SQL = `
  insert into sessions (
    id, mode, role, company, candidate_id, resume_text, jd_text, github_summary,
    difficulty, skills, resume_profile, jd_profile, resume_profile_data, jd_profile_data, match_report, coding,
    coding_interview,
    resume_file_key, resume_file_url, resume_file_name,
    status, created_at, started_at, score, duration_ms, feedback, roadmap, transcript,
    project_profile_data, project_index, github_analysis, github_analyzed_at,
    user_id, voice
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13, $14, $15, $16,
    $17,
    $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, $28,
    $29, $30, $31, $32,
    $33, $34
  )
  on conflict (id) do update set
    mode = excluded.mode,
    role = excluded.role,
    company = excluded.company,
    candidate_id = excluded.candidate_id,
    resume_text = excluded.resume_text,
    jd_text = excluded.jd_text,
    github_summary = excluded.github_summary,
    difficulty = excluded.difficulty,
    skills = excluded.skills,
    resume_profile = excluded.resume_profile,
    jd_profile = excluded.jd_profile,
    resume_profile_data = excluded.resume_profile_data,
    jd_profile_data = excluded.jd_profile_data,
    match_report = excluded.match_report,
    coding = excluded.coding,
    coding_interview = excluded.coding_interview,
    resume_file_key = excluded.resume_file_key,
    resume_file_url = excluded.resume_file_url,
    resume_file_name = excluded.resume_file_name,
    status = excluded.status,
    created_at = excluded.created_at,
    started_at = excluded.started_at,
    score = excluded.score,
    duration_ms = excluded.duration_ms,
    feedback = excluded.feedback,
    roadmap = excluded.roadmap,
    transcript = excluded.transcript,
    project_profile_data = excluded.project_profile_data,
    project_index = excluded.project_index,
    github_analysis = excluded.github_analysis,
    github_analyzed_at = excluded.github_analyzed_at,
    user_id = excluded.user_id,
    voice = excluded.voice
`;

export function toRow(rec: Record<string, any>) {
  return [
    rec.id,
    rec.mode ?? 'CODING',
    rec.role ?? 'Software Engineer',
    rec.company ?? 'Unknown',
    rec.candidateId ?? 'anonymous',
    rec.resumeText ?? '',
    rec.jdText ?? '',
    rec.githubSummary ?? '',
    rec.difficulty ?? 'Medium',
    rec.skills ?? [],
    rec.resumeProfile ?? '',
    rec.jdProfile ?? '',
    rec.resumeProfileData ?? null,
    rec.jdProfileData ?? null,
    rec.matchReport ?? null,
    rec.coding ?? null,
    rec.codingInterview ?? null,
    rec.resumeFileKey ?? null,
    rec.resumeFileUrl ?? null,
    rec.resumeFileName ?? null,
    rec.status ?? 'SETUP',
    rec.createdAt ?? new Date().toISOString(),
    rec.startedAt ?? null,
    rec.score ?? null,
    rec.durationMs ?? null,
    rec.feedback ?? null,
    rec.roadmap ?? null,
    rec.transcript ?? [],
    rec.projectProfileData ?? null,
    rec.projectIndex ?? null,
    rec.githubAnalysis ?? '',
    rec.githubAnalyzedAt ?? null,
    rec.userId ?? null,
    rec.voice ?? null,
  ];
}

export function fromRow(row: any): Record<string, any> {
  return {
    id: row.id,
    mode: row.mode,
    role: row.role,
    company: row.company,
    candidateId: row.candidate_id,
    resumeText: row.resume_text,
    jdText: row.jd_text,
    githubSummary: row.github_summary,
    difficulty: row.difficulty ?? 'Medium',
    skills: row.skills ?? [],
    resumeProfile: row.resume_profile ?? '',
    jdProfile: row.jd_profile ?? '',
    resumeProfileData: row.resume_profile_data ?? null,
    jdProfileData: row.jd_profile_data ?? null,
    matchReport: row.match_report ?? null,
    coding: row.coding ?? null,
    codingInterview: row.coding_interview ?? null,
    resumeFileKey: row.resume_file_key ?? null,
    resumeFileUrl: row.resume_file_url ?? null,
    resumeFileName: row.resume_file_name ?? null,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    score: row.score,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    feedback: row.feedback,
    roadmap: row.roadmap,
    transcript: row.transcript ?? [],
    projectProfileData: row.project_profile_data ?? null,
    projectIndex: row.project_index ?? null,
    githubAnalysis: row.github_analysis ?? '',
    githubAnalyzedAt: row.github_analyzed_at ? new Date(row.github_analyzed_at).toISOString() : null,
    userId: row.user_id ?? null,
    voice: row.voice ?? null,
  };
}

export function createPostgresStore(connectionString: string): SessionStore {
  const ssl =
    process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false };

  const pool = new Pool({ connectionString, ssl, max: 5 });
  pool.on('error', (err) => {
    console.error('[Sessions] Postgres pool error:', err.message);
  });

  let schemaReady: Promise<void> | null = null;
  function ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = pool.query(SCHEMA_SQL).then(() => undefined);
    }
    return schemaReady;
  }

  return {
    kind: 'postgres',

    async load() {
      await ensureSchema();
      const { rows } = await pool.query('select * from sessions order by created_at desc');
      return rows.map(fromRow);
    },

    async persist(records) {
      if (records.length === 0) return;
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const rec of records) {
          await client.query(UPSERT_SQL, toRow(rec));
        }
        await client.query('commit');
      } catch (err) {
        try {
          await client.query('rollback');
        } catch {
          // ignore rollback failures; original error below is what matters
        }
        throw err;
      } finally {
        client.release();
      }
    },

    ensureSchema,

    async close() {
      await pool.end();
    },
  };
}
