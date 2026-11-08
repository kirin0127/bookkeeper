import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const defaultDatabasePath = resolve(root, 'database/bookkeeper.db');

export function openDatabase(path = defaultDatabasePath, { resetLegacy = false } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    let exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'categories'").get();
    const hasAccounts = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get();
    if (exists && !hasAccounts) {
      if (!resetLegacy || path === ':memory:') throw new Error('舊版單人資料庫：需提供初始帳號設定才能備份並重建。');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
      if (tables.join(',') !== 'categories,expenses,import_batches' || db.prepare('PRAGMA table_info(expenses)').all().some(column => column.name === 'account_id')) {
        throw new Error('未知的資料庫格式，拒絕自動重建。');
      }
      // Only the explicitly supported single-user schema is reset. Preserve a full SQLite snapshot first.
      const backupPath = `${path}.single-user-${Date.now()}.bak`;
      db.prepare('VACUUM INTO ?').run(backupPath);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec('DROP TABLE expenses; DROP TABLE import_batches; DROP TABLE categories;');
        db.exec(readFileSync(resolve(root, 'database/schema.sql'), 'utf8'));
        db.exec(readFileSync(resolve(root, 'database/init.sql'), 'utf8'));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      console.log(`舊版資料庫已備份至 ${backupPath}；新版資料庫請重新匯入 CSV。`);
      exists = true;
    }
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
    db.prepare('SELECT id, account_id, category_id, amount, currency, recorded_at_ms, note FROM expenses LIMIT 0').all();
    db.prepare('SELECT id, username, password_hash, created_at_ms, updated_at_ms FROM accounts LIMIT 0').all();
    db.prepare('SELECT token_hash, account_id, created_at_ms, expires_at_ms FROM sessions LIMIT 0').all();
    db.prepare('SELECT id, account_id FROM import_batches LIMIT 0').all();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
