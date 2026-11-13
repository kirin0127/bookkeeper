let generation = 0;
export function invalidateRequests() { generation++; }

async function request(path, options = {}, responseType = 'json') {
  const current = generation;
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options });
  } catch (error) {
    if (current !== generation) throw new DOMException('登入狀態已變更。', 'AbortError');
    if (error.name === 'AbortError') throw error;
    throw new Error('無法連線到伺服器，請確認網路與後端是否啟動。');
  }
  if (current !== generation) throw new DOMException('登入狀態已變更。', 'AbortError');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (current !== generation) throw new DOMException('登入狀態已變更。', 'AbortError');
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth-expired'));
    const error = new Error(body.error || '操作失敗，請稍後再試。');
    error.status = response.status;
    throw error;
  }
  const result = responseType === 'download'
    ? { blob: await response.blob(), disposition: response.headers.get('Content-Disposition') || '' }
    : response.status === 204 ? null : await response.json();
  if (current !== generation) throw new DOMException('登入狀態已變更。', 'AbortError');
  return result;
}
export const getMe = () => request('/auth/me');
export const login = body => request('/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const logout = () => request('/auth/logout', { method: 'POST' });
export const getCategories = () => request('/categories');
export const getExpenses = (start, end, signal) => request(`/expenses?start=${start}&end=${end}`, { signal });
export const addExpense = body => request('/expenses', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const deleteExpense = id => request(`/expenses/${id}`, { method: 'DELETE' });
export const updateExpense = (id, body) => request(`/expenses/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export function importCsv(action, file, source, previewHash) {
  const params = new URLSearchParams({ source, filename: file.name });
  if (previewHash) params.set('preview_hash', previewHash);
  return request(`/imports/${action}?${params}`, {
    method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: file,
  });
}
export function exportQuery(range) {
  return range ? '?' + new URLSearchParams({ start: range[0], end: range[1] }) : '';
}
export const previewExport = (range, signal) => request(`/exports/preview${exportQuery(range)}`, { signal });
export const downloadExport = range => request(`/exports/csv${exportQuery(range)}`, {}, 'download');
