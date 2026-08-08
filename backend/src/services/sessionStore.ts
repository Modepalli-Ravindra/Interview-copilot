import { createJsonStore } from './stores/jsonStore';
import { createPostgresStore } from './stores/postgresStore';
import { createSupabaseStore } from './stores/supabaseStore';

// ──────────────────────────────────────────────────────────────
// Pluggable session persistence.
//   1. SUPABASE_URL + SUPABASE_KEY set  -> Supabase (JS client)
//   2. DATABASE_URL set                 -> Postgres (pg driver)
//   3. otherwise                        -> JSON file (local dev)
// All stores expose the same SessionStore interface so the
// in-memory session Map + REST surface never change.
// ──────────────────────────────────────────────────────────────

export interface SessionStore {
  kind: 'json' | 'postgres';
  /** Load all session records (called once at boot). */
  load(): Promise<Record<string, any>[]>;
  /** Persist the full set of records (called on each change). */
  persist(records: Record<string, any>[]): Promise<void>;
  /** Idempotent schema creation (Postgres only, no-op for JSON). */
  ensureSchema?(): Promise<void>;
  /** Release connection resources. */
  close?(): Promise<void>;
}

export function createSessionStore(): SessionStore {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_KEY || '').trim();
  if (supabaseUrl && supabaseKey) {
    return createSupabaseStore(supabaseUrl, supabaseKey);
  }
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (dbUrl) {
    return createPostgresStore(dbUrl);
  }
  return createJsonStore();
}
