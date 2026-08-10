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
  difficulty     text not null default 'Medium',
  skills         jsonb not null default '[]'::jsonb,
  resume_profile text not null default '',
  jd_profile     text not null default '',
  resume_profile_data jsonb,
  jd_profile_data     jsonb,
  match_report        jsonb,
  coding         jsonb,
  resume_file_key  text,
  resume_file_url  text,
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
alter table sessions add column if not exists resume_file_key  text;
alter table sessions add column if not exists resume_file_url  text;
alter table sessions add column if not exists resume_file_name text;

-- Phase 4: GitHub project-profile columns (additive).
alter table sessions add column if not exists project_profile_data jsonb;
alter table sessions add column if not exists project_index        jsonb;
alter table sessions add column if not exists github_analysis      text not null default '';
alter table sessions add column if not exists github_analyzed_at   timestamptz;


-- Single-user app: the backend connects with the owner/service-role
-- credential, so RLS is not enforced on that connection. If you later
-- add Supabase Auth, create an RLS policy on the anon/authenticated role.
