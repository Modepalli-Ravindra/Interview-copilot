// One-shot migration: backend/data/sessions.json -> database.
//
//   npm run db:migrate
//
// Requires either SUPABASE_URL + SUPABASE_KEY, or DATABASE_URL to be set
// (backend/.env or environment). For Supabase, run backend/db/schema.sql
// once in the SQL editor first (the JS client cannot create tables).

import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { createSessionStore } from '../src/services/sessionStore';
import { createJsonStore } from '../src/services/stores/jsonStore';

async function main() {
  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
  const hasPg = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!hasSupabase && !hasPg) {
    console.error(
      'No database configured. Set SUPABASE_URL + SUPABASE_KEY (or DATABASE_URL) in backend/.env or the environment first.',
    );
    process.exit(1);
  }

  const jsonFile = path.resolve(__dirname, '../data/sessions.json');
  if (!fs.existsSync(jsonFile)) {
    console.log('No sessions.json found; nothing to migrate.');
    return;
  }

  const json = createJsonStore();
  const records = await json.load();
  console.log(`Read ${records.length} session(s) from backend/data/sessions.json`);

  const store = createSessionStore();
  try {
    if (store.ensureSchema) await store.ensureSchema();
    await store.persist(records);
    console.log(`Migrated ${records.length} session(s) to ${store.kind === 'postgres' ? 'Postgres' : 'store'}.`);
  } finally {
    if (store.close) await store.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
