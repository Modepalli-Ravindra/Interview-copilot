import * as fs from 'fs';
import * as path from 'path';
import { SessionStore } from '../sessionStore';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

// JSON-file persistence: preserves the original local-dev behavior
// when DATABASE_URL is not configured.
export function createJsonStore(): SessionStore {
  return {
    kind: 'json',

    async load() {
      try {
        if (!fs.existsSync(DATA_FILE)) return [];
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        return Array.isArray(parsed) ? parsed.filter((s) => s && s.id) : [];
      } catch (err) {
        console.error('[Sessions] Failed to load persisted sessions:', (err as Error).message);
        return [];
      }
    },

    async persist(records) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
      } catch (err) {
        console.error('[Sessions] Failed to persist sessions:', (err as Error).message);
      }
    },
  };
}
