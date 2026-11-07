import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { openDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';
import { prepareImport, commitImport, isoTaipei } from '../src/transfer.js';
import { dayRange } from '../../frontend/src/lib/format.js';

const headers = ['Account', 'Category', 'Amount', 'Currency', 'Recorded At', 'note', 'Account ID'];
const row = (category = '食物', amount = '80', date = '2024/02/29 23:59', note = '午餐') => ['忽略此帳戶', category, amount, 'TWD', date, note, 'not-an-id'];
const csv = (rows, columns = headers) => Buffer.from(stringify(rows, { header: true, columns, bom: true, record_delimiter: '\r\n' }));
const prepare = (db, bytes, source = 'fortune-city') => prepareImport(db, bytes, source, 'test.csv');

test('matches category names to database IDs, ignores accounts, income and unknown categories', () => {
  const db = openDatabase(':memory:');
  try {
    db.exec("UPDATE categories SET id = 42 WHERE name = '食物'; INSERT INTO categories VALUES (99, '新增類別', 9, 1)");
    const notes = '逗號,引號"和換行\n第二行';
    const bytes = csv([row('食物', '80.00', undefined, notes), row('收入', 'bad', 'bad'), row('未知'), row('新增類別'), row('3C', '10')]);
    const prepared = prepare(db, bytes);
    assert.equal(prepared.summary.total_rows, 5);
    assert.equal(prepared.summary.imported_rows, 2);
    assert.equal(prepared.summary.skipped_rows, 3);
    assert.equal(prepared.summary.amount, 90);
    assert.equal(prepared.records[0].category_id, 42);
    assert.equal(prepared.records[0].note, notes);
    assert.equal(prepared.records[0].recorded_at_ms, Date.parse('2024-02-29T23:59:00+08:00'));
    assert.equal(prepared.records[1].source_row_number, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
    const result = commitImport(db, prepared, prepared.summary.file_sha256);
    assert.equal(result.imported_rows, 2);
    const batch = db.prepare('SELECT * FROM import_batches').get();
    assert.equal(batch.total_rows, 5);
    assert.equal(batch.imported_rows, 2);
    assert.equal(batch.source, 'fortune-city');
    assert.equal(batch.original_filename, 'test.csv');
    assert.ok(batch.imported_at_ms > 0);
    assert.deepEqual(db.prepare('SELECT source_row_number FROM expenses ORDER BY id').all().map(r => r.source_row_number), [1, 5]);
    const duplicate = prepare(db, bytes);
    assert.ok(duplicate.summary.duplicate);
    assert.throws(() => commitImport(db, duplicate, duplicate.summary.file_sha256), /已經匯入/);
    assert.throws(() => commitImport(db, prepared, prepared.summary.file_sha256), /已經匯入/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 2);
  } finally { db.close(); }
});

test('does not require ignored Account fields and rejects malformed CSV and unsupported encoding', () => {
  const db = openDatabase(':memory:');
  try {
    const columns = ['Category', 'Amount', 'Currency', 'Recorded At', 'note'];
    assert.equal(prepare(db, csv([['食物', '10', 'TWD', '2024/01/01 01:00', '']], columns)).summary.imported_rows, 1);
    for (const bytes of [Buffer.from(''), Buffer.from('Category,Amount\n食物,10'), Buffer.from('a,a\nx,y'), Buffer.from('"unterminated'), Buffer.from([0xff, 0xfe, 0x00])]) {
      assert.throws(() => prepare(db, bytes));
    }
    assert.throws(() => prepare(db, Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/);
    assert.throws(() => prepare(db, csv([row()]), 'invalid'), /來源/);
  } finally { db.close(); }
});

test('invalid supported rows block the entire batch; errors are bounded and dates strictly validated', () => {
  const db = openDatabase(':memory:');
  try {
    const invalid = [row('食物', '1.5'), row('食物', '-1'), row('食物', '0'), row('食物', '1e2'), row('食物', '1000000001'), row('食物', '80', '2023/02/29 12:00'), row('食物', '80', '2024/04/31 12:00'), row('食物', '80', '2024/02/29 24:00')];
    const otherCurrency = row(); otherCurrency[3] = 'USD'; invalid.push(otherCurrency);
    const prepared = prepare(db, csv([row(), ...invalid]));
    assert.equal(prepared.summary.error_count, invalid.length);
    assert.equal(prepared.summary.can_import, false);
    assert.throws(() => commitImport(db, prepared, prepared.summary.file_sha256), /格式錯誤/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_batches').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
    const many = prepare(db, csv(Array.from({ length: 25 }, () => row('食物', 'x'))));
    assert.equal(many.summary.error_count, 25);
    assert.equal(many.summary.errors.length, 20);
    assert.equal(prepare(db, csv([row('收入')])).summary.can_import, false);
    const valid = prepare(db, csv([row()]));
    assert.throws(() => commitImport(db, valid, 'wrong-hash'), /重新預覽/);
  } finally { db.close(); }
});

test('rolls back both batch and expenses if a write fails midway', () => {
  const db = openDatabase(':memory:');
  try {
    const prepared = prepare(db, csv([row('食物'), row('飲品')]));
    db.exec("CREATE TEMP TRIGGER fail_import BEFORE INSERT ON expenses WHEN NEW.category_id = 2 BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    assert.throws(() => commitImport(db, prepared, prepared.summary.file_sha256), /test failure/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_batches').get().n, 0);
  } finally { db.close(); }
});

test('ISO output preserves milliseconds and UTC+8 day/year boundaries', () => {
  assert.equal(isoTaipei(Date.parse('2023-12-31T16:00:00.123Z')), '2024-01-01T00:00:00.123+08:00');
  assert.equal(isoTaipei(Date.parse('2024-02-29T15:59:59.999Z')), '2024-02-29T23:59:59.999+08:00');
  const db = openDatabase(':memory:');
  const columns = ['Category', 'Amount', 'Currency', 'Recorded At', 'note'];
  try {
    for (const timestamp of ['2024-01-01T00:00:00.123+08:00', '2023-12-31T16:00:00.123Z', '2023-12-31T11:00:00.123-05:00']) {
      const prepared = prepare(db, csv([['食物', '10', 'TWD', timestamp, '']], columns), 'bookkeeper');
      assert.equal(prepared.records[0].recorded_at_ms, Date.parse('2023-12-31T16:00:00.123Z'));
    }
    for (const timestamp of ['2024-02-30T00:00:00+08:00', '2024-01-01T00:00:00', '2024-01-01T00:00:00+08:60', '2024-01-01T00:00:00+15:00']) {
      assert.equal(prepare(db, csv([['食物', '10', 'TWD', timestamp, '']], columns), 'bookkeeper').summary.error_count, 1);
    }
  } finally { db.close(); }
});

test('HTTP preview/commit/export and CSV reimport preserve data without modifying the source database', async t => {
  const db = openDatabase(':memory:');
  const restore = openDatabase(':memory:');
  const server = createApp(db, { staticDirectory: null }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); restore.close(); });
  const bytes = csv([row('食物', '80', '2024/02/29 00:00', '  =文字, "測試"\n下一行  '), row('飲品', '30', '2024/03/01 00:00'), row('收入')]);
  const post = (action, hash) => fetch(`${origin}/api/imports/${action}?source=fortune-city&filename=test.csv${hash ? `&preview_hash=${hash}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: bytes });
  const response = await post('preview');
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.imported_rows, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 0);
  assert.equal((await post('commit')).status, 409);
  assert.equal((await post('commit', preview.file_sha256)).status, 201);
  assert.equal((await post('commit', preview.file_sha256)).status, 409);
  const allSummary = await (await fetch(`${origin}/api/exports/preview`)).json();
  assert.equal(allSummary.count, 2);
  assert.equal(allSummary.amount, 110);
  const [start, end] = dayRange('2024-02-29');
  const query = `?start=${start}&end=${end}`;
  const summary = await (await fetch(`${origin}/api/exports/preview${query}`)).json();
  assert.equal(summary.count, 1);
  assert.equal(summary.amount, 80);
  const filtered = await (await fetch(`${origin}/api/exports/csv${query}`)).text();
  assert.equal(parse(filtered, { columns: true, bom: true }).length, 1);
  const download = await fetch(`${origin}/api/exports/csv`);
  assert.match(download.headers.get('Content-Type'), /text\/csv/);
  assert.match(download.headers.get('Content-Disposition'), /attachment; filename="bookkeeper-/);
  const output = Buffer.from(await download.arrayBuffer());
  assert.deepEqual([...output.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const rows = parse(output, { columns: true, bom: true });
  assert.equal(rows[0]['Recorded At'], '2024-02-29T00:00:00.000+08:00');
  const restored = prepare(restore, output, 'bookkeeper');
  commitImport(restore, restored, restored.summary.file_sha256);
  const sql = 'SELECT category_id, amount, currency, recorded_at_ms, note FROM expenses ORDER BY recorded_at_ms, id';
  assert.deepEqual(restore.prepare(sql).all(), db.prepare(sql).all());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_batches').get().n, 1);
  assert.equal((await fetch(`${origin}/api/exports/csv?start=1`)).status, 400);
  assert.equal((await fetch(`${origin}/api/exports/preview?start=${end}&end=${start}`)).status, 400);
  assert.equal((await fetch(`${origin}/api/exports/preview?start=0&end=1`)).status, 200);
  assert.equal((await fetch(`${origin}/api/exports/preview?start=0&end=1`).then(r => r.json())).count, 0);
});
