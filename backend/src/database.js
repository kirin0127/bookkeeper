import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const defaultDatabasePath = resolve(root, 'database/bookkeeper.db');

export function openDatabase(path = defaultDatabasePath) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'categories'").get();
    if (!exists) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(readFileSync(resolve(root, 'database/schema.sql'), 'utf8'));
        db.exec(readFileSync(resolve(root, 'database/init.sql'), 'utf8'));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else if (db.prepare('SELECT COUNT(*) AS count FROM categories').get().count === 0) {
      db.exec(readFileSync(resolve(root, 'database/init.sql'), 'utf8'));
    }
    // Verify an existing database is compatible without replacing its data.
    db.prepare('SELECT id, category_id, amount, currency, recorded_at_ms, note FROM expenses LIMIT 0').all();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
