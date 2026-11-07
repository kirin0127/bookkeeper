import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './database.js';
import { createTransferRouter, TransferError } from './transfer.js';

const earliest = Date.parse('1900-01-01T00:00:00+08:00');
const maxRange = 367 * 86400000;
const columns = 'e.id, e.category_id, c.name AS category, e.amount, e.currency, e.recorded_at_ms, e.note';

export function createApp(db, { staticDirectory = resolve(root, 'frontend/dist') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // No cross-origin writes. The frontend and API share one origin.
    if (!['GET', 'HEAD'].includes(req.method) && req.get('Origin')) {
      try {
        if (new URL(req.get('Origin')).host !== req.get('Host')) {
          return res.status(403).json({ error: '不允許跨來源寫入。' });
        }
      } catch {
        return res.status(403).json({ error: '無效的來源。' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', createTransferRouter(db));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/categories', (_req, res) => {
    res.json(db.prepare('SELECT id, name, sort_order, is_active FROM categories ORDER BY sort_order, id').all());
  });
  app.get('/api/expenses', (req, res) => {
    const start = Number(req.query.start), end = Number(req.query.end);
    if (!/^\-?\d+$/.test(String(req.query.start)) || !/^\-?\d+$/.test(String(req.query.end)) ||
        !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < earliest ||
        end <= start || end - start > maxRange) {
      return res.status(400).json({ error: '請提供有效的起訖時間，範圍最多一年。' });
    }
    res.json(db.prepare(`SELECT ${columns} FROM expenses e JOIN categories c ON c.id = e.category_id
      WHERE e.recorded_at_ms >= ? AND e.recorded_at_ms < ? ORDER BY e.recorded_at_ms DESC, e.id DESC`).all(start, end));
  });
  app.post('/api/expenses', (req, res) => {
    const { category_id, amount, recorded_at_ms, note = '' } = req.body ?? {};
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) {
      return res.status(400).json({ error: '金額需為 1～1,000,000,000 的整數。' });
    }
    if (!Number.isSafeInteger(category_id) || !db.prepare('SELECT id FROM categories WHERE id = ? AND is_active = 1').get(category_id)) {
      return res.status(400).json({ error: '請選擇有效的類別。' });
    }
    if (!Number.isSafeInteger(recorded_at_ms) || recorded_at_ms < earliest || recorded_at_ms > Date.now()) {
      return res.status(400).json({ error: '記帳時間需介於 1900 年與現在之間。' });
    }
    if (typeof note !== 'string' || note.length > 200) {
      return res.status(400).json({ error: '說明最多 200 個字。' });
    }
    const now = Date.now();
    const result = db.prepare(`INSERT INTO expenses
      (category_id, amount, currency, recorded_at_ms, note, created_at_ms, updated_at_ms)
      VALUES (?, ?, 'TWD', ?, ?, ?, ?)`).run(category_id, amount, recorded_at_ms, note.trim(), now, now);
    const record = db.prepare(`SELECT ${columns} FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.id = ?`).get(Number(result.lastInsertRowid));
    res.status(201).json(record);
  });
  app.delete('/api/expenses/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: '無效的紀錄編號。' });
    }
    if (!db.prepare('DELETE FROM expenses WHERE id = ?').run(id).changes) {
      return res.status(404).json({ error: '這筆紀錄已不存在，請重新整理。' });
    }
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '找不到此 API。' }));
  if (staticDirectory && existsSync(resolve(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory));
    app.get('/', (_req, res) => res.sendFile(resolve(staticDirectory, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error instanceof TransferError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON 格式不正確。' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: '資料過大。' });
    console.error(error);
    res.status(500).json({ error: '資料庫暫時無法處理，請稍後再試。' });
  });
  return app;
}
