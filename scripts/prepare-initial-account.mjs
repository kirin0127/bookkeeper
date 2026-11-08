import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword, normalizeUsername } from '../backend/src/accounts.js';

export async function prepareInitialAccount(directory, env = process.env) {
  const username = env.INITIAL_ACCOUNT_USERNAME;
  const password = env.INITIAL_ACCOUNT_PASSWORD;
  if (!username && !password) return false;
  if (!username || !password) throw new Error('Set both INITIAL_ACCOUNT_USERNAME and INITIAL_ACCOUNT_PASSWORD.');
  const account = { username: normalizeUsername(username), password_hash: await hashPassword(password) };
  // Plaintext passwords never enter the release or the VPS. This file is outside the public frontend.
  writeFileSync(join(directory, 'initial-account.json'), JSON.stringify(account) + '\n', { mode: 0o644 });
  return true;
}
