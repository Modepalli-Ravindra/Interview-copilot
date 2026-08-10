/**
 * Coding question history store — persists asked questions so the generator
 * can reject duplicates across interviews (JSON file, same durability model
 * as the GitHub cache). Mirrors the sessions tables: a `coding_questions`
 * table is also declared in schema.sql for Postgres-backed deployments.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { QuestionHistoryEntry } from './codingEngine';

const DATA_DIR = path.resolve(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'questions.json');
const MAX_ENTRIES = 500;

let cache: QuestionHistoryEntry[] = [];

function load() {
  try {
    if (!fs.existsSync(FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    if (Array.isArray(parsed)) cache = parsed;
  } catch (err) {
    console.error('[QuestionStore] failed to load history:', (err as Error).message);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(cache.slice(-MAX_ENTRIES), null, 2));
    } catch (err) {
      console.error('[QuestionStore] failed to persist history:', (err as Error).message);
    }
  }, 200);
}

load();

export function getQuestionHistory(): QuestionHistoryEntry[] {
  return cache;
}

export function addQuestionHistory(entry: QuestionHistoryEntry): void {
  cache.push(entry);
  persist();
}

export function addQuestionHistoryMany(entries: QuestionHistoryEntry[]): void {
  cache.push(...entries);
  persist();
}
