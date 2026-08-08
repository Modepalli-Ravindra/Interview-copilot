import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SessionStore } from '../sessionStore';

// ──────────────────────────────────────────────────────────────
// Supabase store — talks to Supabase Postgres via the JS client
// (URL + publishable/anon key). Requires the `sessions` table to
// exist (run backend/db/schema.sql once in the Supabase SQL editor,
// or use a pg DATABASE_URL store which auto-creates it).
// ──────────────────────────────────────────────────────────────

function toRow(rec: Record<string, any>) {
  return {
    id: rec.id,
    mode: rec.mode ?? 'CODING',
    role: rec.role ?? 'Software Engineer',
    company: rec.company ?? 'Unknown',
    candidate_id: rec.candidateId ?? 'anonymous',
    resume_text: rec.resumeText ?? '',
    jd_text: rec.jdText ?? '',
    github_summary: rec.githubSummary ?? '',
    status: rec.status ?? 'SETUP',
    created_at: rec.createdAt ?? new Date().toISOString(),
    started_at: rec.startedAt ?? null,
    score: rec.score ?? null,
    duration_ms: rec.durationMs ?? null,
    feedback: rec.feedback ?? null,
    roadmap: rec.roadmap ?? null,
    transcript: rec.transcript ?? [],
  };
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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    score: row.score,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    feedback: row.feedback,
    roadmap: row.roadmap,
    transcript: row.transcript ?? [],
  };
}

function apiError(err: any): Error {
  const msg = err?.message || String(err);
  const details = err?.details ? ` (${err.details})` : '';
  const hint = err?.hint ? ` — ${err.hint}` : '';
  const code = err?.code ? ` [${err.code}]` : '';
  return new Error(`supabase: ${msg}${details}${hint}${code}`);
}

export function createSupabaseStore(url: string, key: string): SessionStore {
  const supabase: SupabaseClient = createClient(url, key);

  return {
    kind: 'postgres',

    async load() {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw apiError(error);
      return (data || []).map(fromRow);
    },

    async persist(records) {
      if (records.length === 0) return;
      const { error } = await supabase
        .from('sessions')
        .upsert(records.map(toRow), { onConflict: 'id' });
      if (error) throw apiError(error);
    },

    // Schema must be created via the Supabase SQL editor (or the pg DATABASE_URL
    // store auto-creates it). Nothing to do here.
    async ensureSchema() {
      /* no-op for supabase-js */
    },

    async close() {
      /* supabase-js holds no persistent connections to close */
    },
  };
}
