import { randomBytes } from 'node:crypto';
import { openDatabase } from '../src/database.js';
import { dummyHash, insertAccount } from '../src/accounts.js';
import { cookieName, tokenHash, sessionLifetimeMs } from '../src/auth.js';

export function seedAccount(db, username = 'test-user') {
  return db.prepare('SELECT id, username FROM accounts WHERE username = ?').get(username)
    || insertAccount(db, { username, password_hash: dummyHash });
}
export function openTestDatabase(path = ':memory:') {
  const db = openDatabase(path);
  seedAccount(db);
  return db;
}
export function createTestClient(db, server, username = 'test-user') {
  const account = seedAccount(db, username);
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, account_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), account.id, Date.now(), Date.now() + sessionLifetimeMs);
  const origin = `http://127.0.0.1:${server.address().port}`;
  return (path, options = {}) => fetch(`${origin}/api${path}`, {
    ...options, headers: { 'X-Forwarded-Proto': 'https', Origin: origin.replace('http:', 'https:'),
      Cookie: `${cookieName}=${token}`, ...options.headers },
  });
}
