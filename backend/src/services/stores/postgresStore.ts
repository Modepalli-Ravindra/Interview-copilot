import { Pool } from 'pg';
import { SessionStore } from '../sessionStore';

// ──────────────────────────────────────────────────────────────
// Postgres persistence (Supabase/Neon/any PG).
// Maps the in-memory session record to the `sessions` table.
// ──────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  create table if not exists sessions (
    id             uuid primary key,
    mode           text not null default 'CODING',
    role           text not null default 'Software Engineer',
    company        text not null default 'Unknown',
    candidate_id   text not null default 'anonymous',
    resume_text    text not null default '',
    jd_text        text not null default '',
    github_summary text not null default '',
    status         text not null default 'SETUP',
    created_at     timestamptz not null default now(),
    started_at     timestamptz,
    score          integer,
    duration_ms    bigint,
    feedback       jsonb,
    roadmap        jsonb,
    transcript     jsonb not null default '[]'::jsonb
  );
  create index if not exists sessions_status_idx on sessions (status);
  create index if not exists sessions_created_at_idx on sessions (created_at desc);
`;

const UPSERT_SQL = `
  insert into sessions (
    id, mode, role, company, candidate_id, resume_text, jd_text, github_summary,
    status, created_at, started_at, score, duration_ms, feedback, roadmap, transcript
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8,
    $9, $10, $11, $12, $13, $14, $15, $16
  )
  on conflict (id) do update set
    mode = excluded.mode,
    role = excluded.role,
    company = excluded.company,
    candidate_id = excluded.candidate_id,
    resume_text = excluded.resume_text,
    jd_text = excluded.jd_text,
    github_summary = excluded.github_summary,
    status = excluded.status,
    created_at = excluded.created_at,
    started_at = excluded.started_at,
    score = excluded.score,
    duration_ms = excluded.duration_ms,
    feedback = excluded.feedback,
    roadmap = excluded.roadmap,
    transcript = excluded.transcript
`;

function toRow(rec: Record<string, any>) {
  return [
    rec.id,
    rec.mode ?? 'CODING',
    rec.role ?? 'Software Engineer',
    rec.company ?? 'Unknown',
    rec.candidateId ?? 'anonymous',
    rec.resumeText ?? '',
    rec.jdText ?? '',
    rec.githubSummary ?? '',
    rec.status ?? 'SETUP',
    rec.createdAt ?? new Date().toISOString(),
    rec.startedAt ?? null,
    rec.score ?? null,
    rec.durationMs ?? null,
    rec.feedback ?? null,
    rec.roadmap ?? null,
    rec.transcript ?? [],
  ];
}

function fromRow(row: any): Record<string, any> {
  return {
    id: row.id,
    mode: row.mode,
    role: row.role,
    company: row.company,
    candidateId: row.candidate_id,
    resumeText: row.resume_text,
    jdText: row.jd_text,
    githubSummary: row.github_summary,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    score: row.score,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    feedback: row.feedback,
    roadmap: row.roadmap,
    transcript: row.transcript ?? [],
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
