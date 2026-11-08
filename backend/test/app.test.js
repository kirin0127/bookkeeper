import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openTestDatabase as openDatabase, createTestClient } from './helpers.js';
import { createApp } from '../src/app.js';
import { dayKey, dayRange, periodRange, shiftDay, recordedTime } from '../../frontend/src/lib/format.js';

test('database initialization is persistent and does not reset existing categories or expenses', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookkeeper-test-'));
  const path = join(directory, 'test.db');
  let db;
  try {
    db = openDatabase(path);
    assert.deepEqual(db.prepare('SELECT id, name FROM categories ORDER BY id').all().map(row => [row.id, row.name]),
      [[1, '食物'], [2, '飲品'], [3, '交通'], [4, '消費'], [5, '娛樂'], [6, '3C'], [7, '醫藥'], [8, '其他']]);
    db.prepare('UPDATE categories SET is_active = 0 WHERE id = 8').run();
    db.prepare("INSERT INTO expenses (account_id, category_id, amount, currency, recorded_at_ms, note, created_at_ms, updated_at_ms) VALUES (1, 1, 80, 'TWD', 1000, '保存測試', 2000, 2000)").run();
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM categories').get().count, 8);
    assert.equal(db.prepare('SELECT is_active FROM categories WHERE id = 8').get().is_active, 0);
    assert.equal(db.prepare('SELECT amount FROM expenses').get().amount, 80);
    assert.throws(() => db.prepare('DELETE FROM categories WHERE id = 1').run(), /FOREIGN KEY/);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('Taipei day/month/year boundaries are independent of the host timezone', () => {
  assert.equal(dayKey(Date.parse('2026-11-06T15:59:59Z')), '2026-11-06');
  assert.equal(dayKey(Date.parse('2026-11-06T16:00:00Z')), '2026-11-07');
  assert.deepEqual(dayRange('2026-11-06'), [Date.parse('2026-11-05T16:00:00Z'), Date.parse('2026-11-06T16:00:00Z')]);
  assert.deepEqual(periodRange(2024, 2, 'month'), [Date.parse('2024-01-31T16:00:00Z'), Date.parse('2024-02-29T16:00:00Z')]);
  assert.deepEqual(periodRange(2024, 12, 'year'), [Date.parse('2023-12-31T16:00:00Z'), Date.parse('2024-12-31T16:00:00Z')]);
  assert.deepEqual(periodRange(2024, 12, 'month'), [Date.parse('2024-11-30T16:00:00Z'), Date.parse('2024-12-31T16:00:00Z')]);
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(recordedTime('2024-02-29'), Date.parse('2024-02-29T12:00:00+08:00'));
});

test('expense API persists, validates and deletes records with inclusive/exclusive date ranges', async t => {
  const db = openDatabase(':memory:');
  const server = createApp(db, { staticDirectory: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = createTestClient(db, server);
  const post = body => request('/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = { amount: 100, category_id: 1, recorded_at_ms: Date.parse('2024-02-29T12:00:00+08:00'), note: '午餐' };
  let saved;
  await t.test('returns eight categories and creates whole-TWD expenses', async () => {
    assert.equal((await (await request('/categories')).json()).length, 8);
    const response = await post({ ...base, note: "  <script>alert('x')</script>  " });
    assert.equal(response.status, 201);
    saved = await response.json();
    assert.equal(saved.amount, 100);
    assert.equal(saved.currency, 'TWD');
    assert.equal(saved.note, "<script>alert('x')</script>");
    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(saved.id);
    assert.equal(row.recorded_at_ms, base.recorded_at_ms);
    assert.ok(row.created_at_ms > base.recorded_at_ms);
    assert.equal(row.updated_at_ms, row.created_at_ms);
    assert.equal(row.import_batch_id, null);
  });
  await t.test('rejects invalid amounts, categories, dates and notes without writing', async () => {
    const invalid = [
      { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: '100' }, { amount: 1000000001 },
      { category_id: 999 }, { category_id: '1' }, { recorded_at_ms: Date.now() + 86400000 },
      { recorded_at_ms: 1.5 }, { recorded_at_ms: -9999999999999 }, { note: 1 }, { note: 'a'.repeat(201) },
    ];
    for (const fields of invalid) assert.equal((await post({ ...base, ...fields })).status, 400, JSON.stringify(fields));
    db.prepare('UPDATE categories SET is_active = 0 WHERE id = 8').run();
    assert.equal((await post({ ...base, category_id: 8 })).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count, 1);
  });
  await t.test('includes midnight at start and excludes midnight of next day', async () => {
    const [start, end] = dayRange('2024-02-29');
    await post({ ...base, amount: 30, recorded_at_ms: start });
    await post({ ...base, amount: 20, recorded_at_ms: end - 1 });
    await post({ ...base, amount: 999, recorded_at_ms: end });
    const response = await request(`/expenses?start=${start}&end=${end}`);
    const rows = await response.json();
    assert.deepEqual(rows.map(row => row.amount), [20, 100, 30]);
    const [yearStart, yearEnd] = periodRange(2024, 1, 'year');
    assert.equal((await (await request(`/expenses?start=${yearStart}&end=${yearEnd}`)).json()).length, 4);
    assert.equal((await request(`/expenses?start=${end}&end=${start}`)).status, 400);
    assert.equal((await request('/expenses')).status, 400);
    assert.equal((await request('/expenses?start=0&end=999999999999999')).status, 400);
  });
  await t.test('rejects malformed JSON and cross-origin writes', async () => {
    assert.equal((await request('/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await request('/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: JSON.stringify(base) })).status, 403);
  });
  await t.test('deletes only the specified record and reports a missing ID', async () => {
    assert.equal((await request(`/expenses/${saved.id}`, { method: 'DELETE' })).status, 204);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count, 3);
    assert.equal((await request(`/expenses/${saved.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await request('/expenses/invalid', { method: 'DELETE' })).status, 400);
  });
});
