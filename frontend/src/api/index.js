async function request(path, options = {}, responseType = 'json') {
  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('無法連線到伺服器，請確認網路與後端是否啟動。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || '操作失敗，請稍後再試。');
  }
  if (responseType === 'response') return response;
  return response.status === 204 ? null : response.json();
}
export const getCategories = () => request('/categories');
export const getExpenses = (start, end, signal) => request(`/expenses?start=${start}&end=${end}`, { signal });
export const addExpense = body => request('/expenses', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const deleteExpense = id => request(`/expenses/${id}`, { method: 'DELETE' });

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
export const downloadExport = range => request(`/exports/csv${exportQuery(range)}`, {}, 'response');
