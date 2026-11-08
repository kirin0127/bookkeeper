import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { hashPassword, insertAccount, verifyPassword } from '../src/accounts.js';
import { cookieName, tokenHash, sessionLifetimeMs } from '../src/auth.js';
import { bootstrapAccount, readInitialAccount } from '../src/bootstrap.js';
import { prepareInitialAccount } from '../../scripts/prepare-initial-account.mjs';

const password = 'a test password with spaces';
const password_hash = await hashPassword(password);
const first = { username: 'alice', password_hash };

async function setup(t, options = {}) {
  const db = openDatabase(':memory:');
  insertAccount(db, first);
  insertAccount(db, { username: 'bob', password_hash });
  const app = createApp(db, { staticDirectory: null, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { cookie, ...requestOptions } = {}) => fetch(`${origin}/api${path}`, {
    ...requestOptions,
    headers: { 'X-Forwarded-Proto': 'https', Origin: origin.replace('http:', 'https:'),
      ...(cookie ? { Cookie: cookie } : {}), ...requestOptions.headers },
  });
  const signIn = (username = 'alice', secret = password, cookie) => request('/auth/login', {
    method: 'POST', cookie, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: secret }),
  });
  return { db, request, signIn, origin, app };
}
const getCookie = response => response.headers.get('set-cookie').split(';')[0];

test('login stores only a token hash, rotates sessions and logs out only this device', async t => {
  const { db, request, signIn } = await setup(t);
  assert.equal(await verifyPassword(password, password_hash), true);
  assert.equal(await verifyPassword('wrong', password_hash), false);
  const missing = await signIn('unknown', 'wrong');
  const incorrect = await signIn('alice', 'wrong');
  assert.equal(missing.status, 401);
  assert.equal(incorrect.status, 401);
  assert.deepEqual(await missing.json(), await incorrect.json());
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);

  const login = await signIn(' ALICE ');
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { id: 1, username: 'alice' });
  const header = login.headers.get('set-cookie');
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(header.includes(flag), header);
  assert.ok(!header.includes('Domain='));
  const cookie = getCookie(login);
  const token = cookie.slice(cookieName.length + 1);
  const session = db.prepare('SELECT * FROM sessions').get();
  assert.equal(session.token_hash, tokenHash(token));
  assert.notEqual(session.token_hash, token);
  assert.equal(session.expires_at_ms - session.created_at_ms, sessionLifetimeMs);
  assert.equal((await request('/auth/me', { cookie })).status, 200);
  assert.equal((await request('/auth/me', { cookie })).headers.get('cache-control'), 'no-store');

  const secondDevice = getCookie(await signIn());
  const replacement = getCookie(await signIn('alice', password, cookie));
  assert.notEqual(cookie, replacement);
  const oldSession = await request('/auth/me', { cookie });
  assert.equal(oldSession.status, 401);
  assert.equal(oldSession.headers.get('set-cookie'), null);
  assert.equal((await request('/auth/me', { cookie: secondDevice })).status, 200);
  const logout = await request('/auth/logout', { cookie: replacement, method: 'POST' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request('/auth/me', { cookie: replacement })).status, 401);
  assert.equal((await request('/auth/me', { cookie: secondDevice })).status, 200);
  assert.equal((await request('/auth/logout', { cookie: replacement, method: 'POST' })).status, 204);
});

test('all data APIs require a session; rejects expiry, forged and ambiguous cookies', async t => {
  let time = Date.now();
  const { request, signIn } = await setup(t, { authOptions: { now: () => time } });
  for (const path of ['/auth/me', '/categories', '/expenses?start=0&end=1', '/exports/preview', '/exports/csv']) {
    assert.equal((await request(path)).status, 401, path);
  }
  for (const path of ['/expenses', '/imports/preview', '/imports/commit']) {
    assert.equal((await request(path, { method: 'POST' })).status, 401, path);
  }
  assert.equal((await request('/expenses/1', { method: 'DELETE' })).status, 401);
  assert.equal((await request('/health', { headers: { 'X-Forwarded-Proto': 'http' } })).status, 200);
  const cookie = getCookie(await signIn());
  assert.equal((await request('/auth/me', { cookie: `${cookie}; ${cookie}` })).status, 401);
  assert.equal((await request('/auth/me', { cookie: `${cookieName}=${'a'.repeat(43)}` })).status, 401);
  time += sessionLifetimeMs;
  assert.equal((await request('/auth/me', { cookie })).status, 401);
  assert.equal((await request('/exports/csv', { cookie })).status, 401);
});

test('HTTPS and exact same-origin writes protect login, logout and data changes', async t => {
  const { app, request, signIn, origin } = await setup(t);
  const cookie = getCookie(await signIn());
  assert.equal(app.get('trust proxy fn')('127.0.0.1'), true);
  assert.equal(app.get('trust proxy fn')('203.0.113.1'), false);
  for (const path of ['/auth/login', '/auth/logout', '/expenses', '/imports/commit']) {
    for (const headers of [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://evil.example' },
      { Origin: origin }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      assert.equal((await request(path, { cookie, method: 'POST', headers })).status, 403, path);
    }
  }
  assert.equal((await request('/auth/login', { method: 'POST', headers: { 'X-Forwarded-Proto': 'http', Origin: origin } })).status, 400);
  assert.equal((await request('/auth/me', { cookie, headers: { 'X-Forwarded-Proto': 'http' } })).status, 400);
  assert.equal((await request('/auth/me', { cookie })).status, 200);
});

test('accounts cannot read, delete, export or interfere with each other imports', async t => {
  const { db, request, signIn } = await setup(t);
  const alice = getCookie(await signIn());
  const bob = getCookie(await signIn('bob'));
  const body = { amount: 80, category_id: 1, recorded_at_ms: Date.parse('2024-02-29T12:00:00+08:00'), note: 'alice-private', account_id: 2 };
  const created = await request('/expenses', { cookie: alice, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const expense = await created.json();
  assert.equal(created.status, 201);
  assert.equal(db.prepare('SELECT account_id FROM expenses WHERE id = ?').get(expense.id).account_id, 1);
  const query = `?start=${Date.parse('2024-02-29T00:00:00+08:00')}&end=${Date.parse('2024-03-01T00:00:00+08:00')}`;
  assert.equal((await (await request(`/expenses${query}`, { cookie: alice })).json()).length, 1);
  assert.deepEqual(await (await request(`/expenses${query}&account_id=1`, { cookie: bob })).json(), []);
  assert.equal((await request(`/expenses/${expense.id}`, { cookie: bob, method: 'DELETE' })).status, 404);
  assert.equal((await (await request('/exports/preview', { cookie: bob })).json()).count, 0);
  assert.ok(!(await (await request('/exports/csv', { cookie: bob })).text()).includes('alice-private'));

  const csv = 'Category,Amount,Currency,Recorded At,note\n飲品,30,TWD,2024/02/29 12:00,shared-file\n';
  const previewPath = '/imports/preview?source=fortune-city&filename=test.csv&account_id=1';
  const upload = (path, cookie) => request(path, { cookie, method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
  const preview = await (await upload(previewPath, alice)).json();
  const commit = `/imports/commit?source=fortune-city&filename=test.csv&preview_hash=${preview.file_sha256}`;
  assert.equal((await upload(commit, alice)).status, 201);
  assert.equal((await upload(commit, alice)).status, 409);
  assert.equal((await (await upload(previewPath, bob)).json()).duplicate, null);
  assert.equal((await upload(commit, bob)).status, 201);
  assert.equal((await (await request('/exports/preview', { cookie: bob })).json()).amount, 30);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM expenses e JOIN import_batches b ON b.id = e.import_batch_id
    WHERE e.account_id != b.account_id`).get().count, 0);
});

test('login throttling expires and oversized passwords never allocate scrypt work', async t => {
  let time = Date.now();
  const { signIn } = await setup(t, { authOptions: { now: () => time } });
  assert.equal((await signIn('alice', 'a'.repeat(129))).status, 400);
  for (let index = 0; index < 10; index++) assert.equal((await signIn('alice', 'wrong')).status, 401);
  const blocked = await signIn();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  time += 15 * 60 * 1000;
  assert.equal((await signIn()).status, 200);
});

test('release bootstrap contains only a password hash and never overwrites accounts on restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookkeeper-bootstrap-'));
  const path = join(directory, 'test.db');
  let db;
  try {
    assert.equal(await prepareInitialAccount(directory, {}), false);
    await assert.rejects(prepareInitialAccount(directory, { INITIAL_ACCOUNT_USERNAME: 'alice' }));
    await assert.rejects(hashPassword('short'));
    await prepareInitialAccount(directory, { INITIAL_ACCOUNT_USERNAME: 'ALICE', INITIAL_ACCOUNT_PASSWORD: password });
    assert.ok(!readFileSync(join(directory, 'initial-account.json'), 'utf8').includes(password));
    const initial = readInitialAccount(directory);
    assert.equal(initial.username, 'alice');
    assert.equal(await verifyPassword(password, initial.password_hash), true);
    db = openDatabase(path);
    assert.throws(() => bootstrapAccount(db, null), /尚未建立帳號/);
    bootstrapAccount(db, initial);
    db.prepare('INSERT INTO sessions VALUES (?, 1, 1, ?)').run('persisted-hash', Date.now() + sessionLifetimeMs);
    db.close();
    db = openDatabase(path);
    bootstrapAccount(db, { username: 'another-user', password_hash });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count, 1);
    assert.equal(db.prepare('SELECT username FROM accounts').get().username, 'alice');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('legacy reset requires opt-in, snapshots old data and runs only once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookkeeper-legacy-'));
  const path = join(directory, 'test.db');
  let db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT, sort_order INTEGER, is_active INTEGER);
      CREATE TABLE import_batches(id INTEGER PRIMARY KEY);
      CREATE TABLE expenses(id INTEGER PRIMARY KEY, category_id INTEGER, amount INTEGER);
      INSERT INTO categories VALUES (1, 'legacy', 1, 1); INSERT INTO expenses VALUES (1, 1, 80);`);
    db.close();
    assert.throws(() => openDatabase(path), /舊版單人資料庫/);
    db = openDatabase(path, { resetLegacy: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM categories').get().count, 8);
    db.close();
    const backups = readdirSync(directory).filter(name => name.endsWith('.bak'));
    assert.equal(backups.length, 1);
    db = new DatabaseSync(join(directory, backups[0]), { readOnly: true });
    assert.equal(db.prepare('SELECT amount FROM expenses').get().amount, 80);
    db.close();
    db = openDatabase(path, { resetLegacy: true });
    assert.equal(readdirSync(directory).filter(name => name.endsWith('.bak')).length, 1);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
