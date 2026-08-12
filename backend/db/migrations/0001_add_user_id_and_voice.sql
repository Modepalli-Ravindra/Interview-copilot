-- ──────────────────────────────────────────────────────────────
-- Migration 0001: add auth ownership + voice metadata to `sessions`
--
-- WHY: the application code already reads/writes `user_id` and `voice`
-- (see backend/src/services/stores/supabaseStore.ts). Production Supabase
-- databases created before these columns existed fail every session write
-- with:
--   Could not find the 'voice' column of 'sessions' in the schema cache
--   [PGRST204]
-- (and the same for `user_id`). This migration brings an existing database
-- in sync without touching existing rows.
--
-- HOW TO APPLY (production):
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   It is idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to re-run.
--   No data is deleted, dropped, or rewritten.
-- ──────────────────────────────────────────────────────────────

alter table sessions add column if not exists user_id uuid;
alter table sessions add column if not exists voice   jsonb;
