import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { insertAccount, validateAccountHash } from './accounts.js';

export function readInitialAccount(directory) {
  const path = resolve(directory, 'initial-account.json');
  return existsSync(path) ? validateAccountHash(JSON.parse(readFileSync(path, 'utf8'))) : null;
}

export function bootstrapAccount(db, account) {
  if (db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count > 0) return;
  if (!account) throw new Error('尚未建立帳號：本機請執行 npm run account:create；首次部署請設定 INITIAL_ACCOUNT_USERNAME 與 INITIAL_ACCOUNT_PASSWORD Secrets。');
  insertAccount(db, account);
  console.log('初始帳號已建立。後續部署不會覆寫帳號或密碼。');
}
