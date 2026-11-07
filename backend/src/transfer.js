import { Router, raw } from 'express';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const SUPPORTED_NAMES = new Set(['食物', '飲品', '交通', '消費', '娛樂', '3C', '醫藥', '其他']);
const HEADERS = ['Recorded At', 'Category', 'Amount', 'Currency', 'note'];
const OFFSET = 8 * 60 * 60 * 1000;
const EARLIEST = Date.parse('1900-01-01T00:00:00+08:00');
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;

export class TransferError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function isoTaipei(timestamp) {
  return new Date(timestamp + OFFSET).toISOString().replace('Z', '+08:00');
}

function calendarTimestamp(year, month, day, hour, minute, second, ms, offset) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(wall);
  if (year < 1900 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute ||
      check.getUTCSeconds() !== second) throw new Error('日期或時間不存在。');
  const timestamp = wall - offset;
  if (timestamp < EARLIEST || timestamp > Date.now()) throw new Error('日期需介於 1900 年與現在之間。');
  return timestamp;
}

function parseRecordedAt(value, source) {
  if (source === 'fortune-city') {
    const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) throw new Error('Recorded At 需為 YYYY/MM/DD HH:mm（台北時間）。');
    return calendarTimestamp(...match.slice(1, 6).map(Number), Number(match[6] || 0), 0, OFFSET);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error('Recorded At 需為含時區的 ISO 8601，例如 2026-11-02T19:35:00.000+08:00。');
  const hours = Number(match[10] || 0), minutes = Number(match[11] || 0);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) throw new Error('日期時區不正確。');
  const offset = (hours * 60 + minutes) * 60000 * (match[9] === '-' ? -1 : 1);
  return calendarTimestamp(...match.slice(1, 7).map(Number), Number((match[7] || '').padEnd(3, '0')), offset);
}

export function prepareImport(db, bytes, source, filename) {
  if (!['fortune-city', 'bookkeeper'].includes(source)) throw new TransferError('請選擇有效的檔案來源。');
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[\r\n\0]/.test(filename) || !/\.csv$/i.test(filename)) {
    throw new TransferError('請選擇 CSV 檔案。');
  }
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new TransferError('CSV 檔案不可為空。');
  if (bytes.length > MAX_FILE_BYTES) throw new TransferError('CSV 檔案不可超過 5 MB。', 413);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new TransferError('請使用 UTF-8 編碼的 CSV 檔案。'); }
  let rows;
  try {
    let count = 0;
    rows = parse(text, {
      bom: true, skip_empty_lines: true, max_record_size: 65536,
      on_record(record) {
        if (++count > MAX_ROWS + 1) throw new TransferError('單次最多匯入 50,000 筆，請分批匯入。');
        return record;
      },
    });
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError(`CSV 格式不正確${error.lines ? `（第 ${error.lines} 行附近）` : ''}，請檢查引號、欄位數與換行。`);
  }
  const headers = rows.shift()?.map(value => value.trim()) || [];
  if (new Set(headers).size !== headers.length) throw new TransferError('CSV 欄位名稱不可重複。');
  const missing = HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new TransferError(`缺少必要欄位：${missing.join('、')}。`);
  const indexes = Object.fromEntries(HEADERS.map(header => [header, headers.indexOf(header)]));
  // Match the eight names from init.sql to the database's current IDs. Account fields are never read.
  const categories = new Map(db.prepare('SELECT id, name FROM categories').all()
    .filter(category => SUPPORTED_NAMES.has(category.name)).map(category => [category.name, category.id]));
  const accepted = [], errors = [];
  let skipped = 0, errorCount = 0, total = 0, min = null, max = null;
  for (const [index, cells] of rows.entries()) {
    const category = cells[indexes.Category].trim();
    const categoryId = categories.get(category);
    if (category === '收入' || categoryId === undefined) { skipped++; continue; }
    try {
      const rawAmount = cells[indexes.Amount].trim(), amount = Number(rawAmount);
      if (!/^\d+(?:\.0+)?$/.test(rawAmount) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) {
        throw new Error('Amount 需為 1～1,000,000,000 的整數。');
      }
      const currency = cells[indexes.Currency].trim();
      if (currency !== 'TWD') throw new Error('目前僅支援 TWD，無法合併其他幣別。');
      const timestamp = parseRecordedAt(cells[indexes['Recorded At']].trim(), source);
      const note = cells[indexes.note];
      accepted.push({ category_id: categoryId, category, amount, currency, recorded_at_ms: timestamp, note, source_row_number: index + 1 });
      total += amount;
      min = min === null ? timestamp : Math.min(min, timestamp);
      max = max === null ? timestamp : Math.max(max, timestamp);
    } catch (error) {
      errorCount++;
      if (errors.length < 20) errors.push({ row: index + 1, message: error.message });
    }
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const duplicate = db.prepare('SELECT id, imported_at_ms, imported_rows FROM import_batches WHERE source = ? AND file_sha256 = ?').get(source, hash);
  return {
    records: accepted,
    summary: {
      source, filename, file_sha256: hash, total_rows: rows.length, imported_rows: accepted.length,
      skipped_rows: skipped, error_count: errorCount, errors, amount: total, from_ms: min, to_ms: max,
      sample: accepted.slice(0, 3), duplicate: duplicate || null,
      can_import: !duplicate && !errorCount && accepted.length > 0,
    },
  };
}

export function commitImport(db, prepared, expectedHash) {
  const { summary, records } = prepared;
  if (expectedHash !== summary.file_sha256) throw new TransferError('檔案已變更，請重新預覽後再匯入。', 409);
  if (summary.duplicate) throw new TransferError('這份檔案已經匯入過，不會重複新增。', 409);
  if (!summary.can_import) throw new TransferError('沒有可匯入的紀錄，或檔案仍有格式錯誤。', 422);
  db.exec('BEGIN IMMEDIATE');
  try {
    // Recheck inside the write transaction to protect against another process importing the same file.
    if (db.prepare('SELECT id FROM import_batches WHERE source = ? AND file_sha256 = ?').get(summary.source, summary.file_sha256)) {
      throw new TransferError('這份檔案已經匯入過，不會重複新增。', 409);
    }
    const now = Date.now();
    const batch = db.prepare(`INSERT INTO import_batches (source, original_filename, file_sha256, total_rows, imported_rows, imported_at_ms)
      VALUES (?, ?, ?, ?, ?, ?)`).run(summary.source, summary.filename, summary.file_sha256, summary.total_rows, records.length, now);
    const batchId = Number(batch.lastInsertRowid);
    const insert = db.prepare(`INSERT INTO expenses (category_id, amount, currency, recorded_at_ms, note,
      import_batch_id, source_row_number, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const record of records) {
      insert.run(record.category_id, record.amount, record.currency, record.recorded_at_ms, record.note,
        batchId, record.source_row_number, now, now);
    }
    db.exec('COMMIT');
    return { ...summary, batch_id: batchId, imported_at_ms: now };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function exportFilter(query) {
  if (query.start === undefined && query.end === undefined) return { sql: '', values: [] };
  const start = Number(query.start), end = Number(query.end);
  if (!/^-?\d+$/.test(String(query.start)) || !/^-?\d+$/.test(String(query.end)) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < EARLIEST || end <= start ||
      end > Date.parse('2101-01-01T00:00:00+08:00')) throw new TransferError('請選擇有效的匯出日期範圍。');
  return { sql: ' WHERE e.recorded_at_ms >= ? AND e.recorded_at_ms < ?', values: [start, end] };
}

export function createTransferRouter(db) {
  const router = Router();
  const csvBody = raw({ type: ['text/csv', 'application/octet-stream'], limit: MAX_FILE_BYTES });
  router.post('/imports/preview', csvBody, (req, res) => {
    res.json(prepareImport(db, req.body, req.query.source, req.query.filename).summary);
  });
  router.post('/imports/commit', csvBody, (req, res) => {
    const prepared = prepareImport(db, req.body, req.query.source, req.query.filename);
    res.status(201).json(commitImport(db, prepared, req.query.preview_hash));
  });
  router.get('/exports/preview', (req, res) => {
    const filter = exportFilter(req.query);
    const result = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS amount,
      MIN(e.recorded_at_ms) AS from_ms, MAX(e.recorded_at_ms) AS to_ms FROM expenses e${filter.sql}`).get(...filter.values);
    res.json(result);
  });
  router.get('/exports/csv', (req, res) => {
    const filter = exportFilter(req.query);
    const statement = db.prepare(`SELECT e.recorded_at_ms, c.name AS category, e.amount, e.currency, e.note
      FROM expenses e JOIN categories c ON c.id = e.category_id${filter.sql} ORDER BY e.recorded_at_ms, e.id`);
    const rows = statement.all(...filter.values);
    const csv = stringify(rows.map(row => [isoTaipei(row.recorded_at_ms), row.category, row.amount, row.currency, row.note]), {
      header: true, columns: HEADERS, bom: true, record_delimiter: '\r\n',
    });
    const date = isoTaipei(Date.now()).slice(0, 10);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="bookkeeper-${date}.csv"`);
    res.send(csv);
  });
  return router;
}
