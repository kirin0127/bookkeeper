import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
// OWASP's 32 MiB scrypt profile; bounded memory for the 512 MB VPS.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashFormat = /^scrypt\$32768\$8\$3\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;
export const dummyHash = `scrypt$32768$8$3$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;

export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new Error('帳號需為 3～64 個英文字母、數字、句點、底線或連字號。');
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new Error('帳號需為 3～64 個英文字母、數字、句點、底線或連字號。');
  return username;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128 || Buffer.byteLength(password) > 1024) {
    throw new Error('密碼需為 8～128 個字元，可使用空白與中文。');
  }
}

export function validateAccountHash(account) {
  if (!account || normalizeUsername(account.username) !== account.username || !hashFormat.test(account.password_hash)) {
    throw new Error('初始帳號設定格式不正確。');
  }
  return account;
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64, parameters);
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const match = hashFormat.exec(encoded);
  if (!match) throw new Error('不支援的密碼雜湊格式。');
  const key = await derive(password, Buffer.from(match[1], 'base64url'), 64, parameters);
  return timingSafeEqual(key, Buffer.from(match[2], 'base64url'));
}

export function insertAccount(db, account) {
  validateAccountHash(account);
  const now = Date.now();
  const result = db.prepare(`INSERT INTO accounts (username, password_hash, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?)`).run(account.username, account.password_hash, now, now);
  return { id: Number(result.lastInsertRowid), username: account.username };
}
