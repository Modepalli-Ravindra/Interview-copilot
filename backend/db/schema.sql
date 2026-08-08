-- ──────────────────────────────────────────────────────────────
-- InterviewPilot session store (Supabase Postgres)
--
-- HOW TO USE THIS FILE:
--   * Supabase JS-client store (SUPABASE_URL + SUPABASE_KEY):
--     paste this whole file into the Supabase SQL editor and RUN it once.
--     (The JS client cannot create tables, so this step is required.)
--   * pg store (DATABASE_URL): the backend applies this automatically at
--     boot (CREATE IF NOT EXISTS) — no manual step needed.
-- ──────────────────────────────────────────────────────────────

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

-- Single-user app: the backend connects with the owner/service-role
-- credential, so RLS is not enforced on that connection. If you later
-- add Supabase Auth, create an RLS policy on the anon/authenticated role.
