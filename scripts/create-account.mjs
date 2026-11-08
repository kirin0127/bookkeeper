import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { hashPassword, insertAccount, normalizeUsername } from '../backend/src/accounts.js';
import { openDatabase, defaultDatabasePath, root } from '../backend/src/database.js';

if (!process.stdin.isTTY) throw new Error('請在互動終端機執行，密碼不接受命令列參數。');
let hidden = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
let db;
try {
  const username = normalizeUsername(process.argv[2] || await prompt.question('帳號：'));
  process.stdout.write('密碼（15～128 個字元，不顯示輸入）：');
  hidden = true;
  const password = await prompt.question('');
  process.stdout.write('\n再次輸入密碼：');
  const confirmation = await prompt.question('');
  hidden = false;
  process.stdout.write('\n');
  if (password !== confirmation) throw new Error('兩次密碼不一致。');
  const password_hash = await hashPassword(password);
  const path = process.env.DB_PATH ? resolve(root, process.env.DB_PATH) : defaultDatabasePath;
  db = openDatabase(path, { resetLegacy: true });
  insertAccount(db, { username, password_hash });
  console.log(`已建立帳號 ${username}。`);
} finally { prompt.close(); db?.close(); }
