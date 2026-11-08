import { test } from 'node:test';
import assert from 'node:assert/strict';

async function client(t) {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.fetch = previousFetch; globalThis.window = previousWindow; });
  return import(`../../frontend/src/api/index.js?test=${Math.random()}`);
}

test('late JSON and CSV bodies cannot reach a different signed-in account', async t => {
  const api = await client(t);
  let finishJson;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { finishJson = resolve; }) });
  const records = api.getExpenses(0, 1);
  await new Promise(resolve => setImmediate(resolve));
  api.invalidateRequests();
  finishJson([{ note: 'previous account private data' }]);
  await assert.rejects(records, { name: 'AbortError' });

  let finishBlob;
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), blob: () => new Promise(resolve => { finishBlob = resolve; }) });
  const download = api.downloadExport(null);
  await new Promise(resolve => setImmediate(resolve));
  api.invalidateRequests();
  finishBlob(new Blob(['previous account export']));
  await assert.rejects(download, { name: 'AbortError' });
});

test('only a current data request reporting 401 triggers the expired-session screen', async t => {
  const api = await client(t);
  let expired = 0;
  window.addEventListener('auth-expired', () => expired++);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  await assert.rejects(api.getMe(), error => error.status === 401);
  await assert.rejects(api.login({ username: 'alice', password: 'wrong' }), error => error.status === 401);
  assert.equal(expired, 0);
  await assert.rejects(api.getCategories(), error => error.status === 401);
  assert.equal(expired, 1);
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const previous = api.getCategories();
  api.invalidateRequests();
  finish(new Response('{}', { status: 401 }));
  await assert.rejects(previous, { name: 'AbortError' });
  assert.equal(expired, 1);
});

test('network and server failures preserve a distinct error from unauthenticated status', async t => {
  const api = await client(t);
  let expired = false;
  window.addEventListener('auth-expired', () => { expired = true; });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(api.getMe(), /無法連線/);
  globalThis.fetch = async () => new Response('{"error":"暫時無法使用"}', { status: 503 });
  await assert.rejects(api.getMe(), error => error.status === 503 && error.message === '暫時無法使用');
  assert.equal(expired, false);
});
