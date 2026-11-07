import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { openDatabase, defaultDatabasePath, root } from './database.js';

const path = process.env.DB_PATH ? resolve(root, process.env.DB_PATH) : defaultDatabasePath;
const db = openDatabase(path);
const port = Number(process.env.PORT || 3001);
const releaseFile = resolve(root, 'RELEASE');
const releaseId = existsSync(releaseFile) ? readFileSync(releaseFile, 'utf8').trim() : 'local';
// Bind only to loopback. A future VPS deployment should use an authenticated HTTPS proxy.
const server = createApp(db, { releaseId }).listen(port, '127.0.0.1', () => {
  console.log(`Bookkeeper API: http://127.0.0.1:${port}`);
  console.log(`SQLite: ${path}`);
});
server.on('error', error => { console.error(error.message); db.close(); process.exit(1); });
function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
