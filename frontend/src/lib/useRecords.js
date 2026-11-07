import { ref, watch, onBeforeUnmount } from 'vue';
import { getExpenses } from '../api';

export function useRecords(range) {
  const records = ref([]), loading = ref(false), error = ref('');
  let controller, version = 0;
  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const current = ++version;
    loading.value = true;
    error.value = '';
    records.value = [];
    try {
      const [start, end] = range.value;
      const result = await getExpenses(start, end, controller.signal);
      if (current === version) records.value = result;
    } catch (failure) {
      if (current === version && failure.name !== 'AbortError') error.value = failure.message;
    } finally {
      if (current === version) loading.value = false;
    }
  }
  watch(range, reload, { immediate: true });
  onBeforeUnmount(() => { version++; controller?.abort(); });
  return { records, loading, error, reload };
}
