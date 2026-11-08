import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { dummyHash, normalizeUsername, verifyPassword } from './accounts.js';

export const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const cookieName = '__Host-session';
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
const cookieOptions = { secure: true, httpOnly: true, sameSite: 'lax', path: '/' };

function readToken(req) {
  const matches = (req.get('Cookie') || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function requireHttps(req, res, next) {
  if (!req.secure) return res.status(400).json({ error: '請使用 HTTPS 連線。' });
  next();
}

// Browser writes must carry the exact external origin, including protocol and port.
export function checkWriteOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = `${req.protocol}://${req.get('Host')}`;
  if (req.get('Origin') !== expected || req.get('Sec-Fetch-Site') === 'cross-site') {
    return res.status(403).json({ error: '不允許此來源的寫入請求。' });
  }
  next();
}

export function createAuth(db, { now = Date.now } = {}) {
  const router = Router();
  const attempts = new Map();
  let verifying = 0;
  const windowMs = 15 * 60 * 1000;
  function consumeAttempt(key, limit) {
    const time = now();
    for (const [name, entry] of attempts) if (entry.until <= time) attempts.delete(name);
    let entry = attempts.get(key);
    if (!entry) {
      // Refuse more work when full instead of evicting live rate limits.
      if (attempts.size >= 5000) return 900;
      entry = { count: 0, until: time + windowMs };
      attempts.set(key, entry);
    }
    if (entry.count >= limit) return Math.max(1, Math.ceil((entry.until - time) / 1000));
    entry.count++;
    return 0;
  }
  function requireAccount(req, res, next) {
    const token = readToken(req);
    const account = token && db.prepare(`SELECT a.id, a.username FROM sessions s
      JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at_ms > ?`).get(tokenHash(token), now());
    if (!account) {
      // A delayed response from an old session must not erase a newer login's cookie.
      // Only an explicit logout clears the cookie; a successful login replaces it.
      return res.status(401).json({ error: '請重新登入。' });
    }
    req.account = account;
    next();
  }

  router.use(requireHttps);
  router.post('/login', async (req, res) => {
    const ipWait = consumeAttempt(`ip:${req.ip}`, 50);
    if (ipWait) return res.set('Retry-After', String(ipWait)).status(429).json({ error: '登入嘗試過於頻繁，請稍後再試。' });
    let username;
    try { username = normalizeUsername(req.body?.username); }
    catch { return res.status(400).json({ error: '請輸入有效的帳號與密碼。' }); }
    const password = req.body?.password;
    if (typeof password !== 'string' || !password.length || [...password].length > 128 || Buffer.byteLength(password) > 1024) {
      return res.status(400).json({ error: '請輸入有效的帳號與密碼。' });
    }
    const accountWait = consumeAttempt(`account:${username}`, 10);
    if (accountWait || verifying >= 2) {
      return res.set('Retry-After', String(accountWait || 1)).status(429).json({ error: '登入嘗試過於頻繁，請稍後再試。' });
    }
    const account = db.prepare('SELECT id, username, password_hash FROM accounts WHERE username = ?').get(username);
    verifying++;
    let valid;
    try { valid = await verifyPassword(password, account?.password_hash || dummyHash); }
    finally { verifying--; }
    if (!valid || !account) return res.status(401).json({ error: '帳號或密碼錯誤。' });
    const token = randomBytes(32).toString('base64url');
    const time = now();
    const previous = readToken(req);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(previous));
      db.prepare('DELETE FROM sessions WHERE expires_at_ms <= ?').run(time);
      db.prepare('INSERT INTO sessions (token_hash, account_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)')
        .run(tokenHash(token), account.id, time, time + sessionLifetimeMs);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetimeMs });
    res.json({ id: account.id, username: account.username });
  });
  router.get('/me', requireAccount, (req, res) => res.json(req.account));
  router.post('/logout', (req, res) => {
    const token = readToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    res.clearCookie(cookieName, cookieOptions);
    res.status(204).end();
  });
  return { router, requireAccount };
}
