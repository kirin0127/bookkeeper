<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { dayKey, dayStart, shiftDay, periodRange, money } from '../lib/format';
import { previewExport, downloadExport } from '../api';
const props = defineProps({ today: String, active: Boolean });
const emit = defineEmits(['busy']);
const rangeType = ref('all'), from = ref(props.today.slice(0, 7) + '-01'), to = ref(props.today);
const summary = ref(null), loading = ref(false), busy = ref(false), error = ref(''), downloaded = ref(false);
const range = computed(() => {
  if (rangeType.value === 'all') return null;
  if (rangeType.value === 'month') return periodRange(Number(props.today.slice(0, 4)), Number(props.today.slice(5, 7)), 'month');
  if (!from.value || !to.value || from.value > to.value || from.value < '1900-01-01' || to.value > props.today) return false;
  return [dayStart(from.value), dayStart(shiftDay(to.value, 1))];
});
const period = computed(() => summary.value?.from_ms != null ? `${dayKey(summary.value.from_ms)} — ${dayKey(summary.value.to_ms)}` : '此範圍沒有花費紀錄');
let controller, version = 0;
async function refresh() {
  controller?.abort();
  const current = ++version;
  summary.value = null; error.value = ''; downloaded.value = false; loading.value = false;
  if (!props.active || range.value === false) return;
  controller = new AbortController(); loading.value = true;
  try { const value = await previewExport(range.value, controller.signal); if (current === version) summary.value = value; }
  catch (failure) { if (current === version && failure.name !== 'AbortError') error.value = failure.message; }
  finally { if (current === version) loading.value = false; }
}
watch([range, () => props.active], refresh, { immediate: true });
watch(busy, value => emit('busy', value), { flush: 'sync' });
onBeforeUnmount(() => { version++; controller?.abort(); });
async function download() {
  if (busy.value || !summary.value?.count || range.value === false) return;
  busy.value = true; error.value = ''; downloaded.value = false;
  try {
    const { blob, disposition } = await downloadExport(range.value);
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = /filename="([^"]+)"/.exec(disposition)?.[1] || `bookkeeper-${props.today}.csv`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    downloaded.value = true;
  } catch (failure) { error.value = failure.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <section aria-label="匯出 CSV">
    <p class="transfer-intro">將花費下載成 CSV，自己保留一份紀錄。</p>
    <div class="transfer-card"><h3>匯出範圍</h3><div class="range-options"><button v-for="[value, label] in [['all','全部紀錄'],['month','本月'],['custom','自訂日期']]" :key="value" :disabled="busy" :class="{ active: rangeType === value }" :aria-pressed="rangeType === value" @click="rangeType = value">{{ label }}</button></div>
      <div v-if="rangeType === 'custom'" class="export-dates"><label for="export-from">開始日期<input id="export-from" v-model="from" type="date" min="1900-01-01" :max="today" :disabled="busy"></label><label for="export-to">結束日期<input id="export-to" v-model="to" type="date" min="1900-01-01" :max="today" :disabled="busy"></label></div>
      <p v-else class="transfer-note">{{ rangeType === 'all' ? '包含目前所有花費紀錄。' : `${today.slice(0, 7)}-01 — ${today}` }}</p>
    </div>
    <div class="transfer-card"><div class="transfer-card-title"><h3>匯出摘要</h3><span class="demo-badge">CSV</span></div>
      <p v-if="range === false" class="form-error" role="alert">請選擇 1900 年至今天的完整日期，結束日期不得早於開始日期。</p>
      <p v-else-if="loading" class="transfer-note" role="status">正在計算筆數與金額…</p>
      <template v-else-if="summary"><div class="transfer-summary"><div><span>花費筆數</span><strong>{{ summary.count.toLocaleString() }} 筆</strong></div><div><span>花費總額</span><strong>{{ money(summary.amount) }}</strong></div></div><p class="transfer-period">{{ period }}</p></template>
      <div class="export-format"><span>檔案格式</span><strong>日常記帳 CSV</strong></div><p class="transfer-note">包含日期時間、類別、整數金額、幣別與說明，可再次匯入本 app。</p><p class="transfer-note">日期時間使用 UTC+8，例如<br><code>2026-11-02T19:35:00.000+08:00</code></p>
    </div>
    <p v-if="error" class="form-error transfer-error" role="alert">{{ error }} <button v-if="!summary" class="small-button" @click="refresh">重試</button></p>
    <div class="transfer-footer"><button class="primary transfer-action" :disabled="busy || loading || !summary?.count || range === false" @click="download">{{ busy ? '正在準備檔案…' : '匯出 CSV' }}</button><p class="transfer-note">匯出不會刪除或更動原有紀錄。</p></div>
    <div v-if="downloaded" class="export-result" role="status"><strong>已送出 CSV 下載</strong><p>請在瀏覽器下載項目查看檔案。</p></div>
  </section>
</template>
