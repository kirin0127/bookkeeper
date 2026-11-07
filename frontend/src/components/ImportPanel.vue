<script setup>
import { computed, ref, watch } from 'vue';
import ModalSheet from './ModalSheet.vue';
import ExpenseList from './ExpenseList.vue';
import { importCsv } from '../api';
import { dayKey, money } from '../lib/format';

const emit = defineEmits(['busy']);
const source = ref('fortune-city'), file = ref(null), preview = ref(null), result = ref(null);
const busy = ref(false), error = ref(''), confirming = ref(false), inputKey = ref(0);
const period = value => value?.from_ms != null ? `${dayKey(value.from_ms)} — ${dayKey(value.to_ms)}` : '沒有可匯入的花費';
const sample = computed(() => (preview.value?.sample || []).map(record => ({ ...record, id: record.source_row_number })));
function reset() {
  file.value = null; preview.value = null; result.value = null; error.value = ''; inputKey.value++;
}
watch(source, reset);
watch(busy, value => emit('busy', value), { flush: 'sync' });
function chooseFile(event) {
  const selected = event.target.files[0];
  if (!selected) return;
  reset();
  if (!/\.csv$/i.test(selected.name)) { error.value = '請選擇 CSV 檔案。'; return; }
  if (!selected.size || selected.size > 5 * 1024 * 1024) { error.value = '請選擇非空白、5 MB 以內的 CSV 檔案。'; return; }
  file.value = selected;
}
async function inspect() {
  if (!file.value || busy.value) return;
  busy.value = true; error.value = '';
  try { preview.value = await importCsv('preview', file.value, source.value); }
  catch (failure) { error.value = failure.message; }
  finally { busy.value = false; }
}
async function commit() {
  if (!preview.value?.can_import || busy.value) return;
  busy.value = true; error.value = '';
  try {
    result.value = await importCsv('commit', file.value, source.value, preview.value.file_sha256);
    confirming.value = false;
  } catch (failure) { error.value = failure.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <section aria-label="匯入 CSV">
    <template v-if="result">
      <div class="transfer-result" role="status"><span class="result-icon" aria-hidden="true">✓</span><h2>匯入完成</h2><p>已新增 {{ result.imported_rows.toLocaleString() }} 筆花費</p><strong>{{ money(result.amount) }}</strong><p class="file-name">{{ result.filename }}</p></div>
      <div class="transfer-card"><h3>這批紀錄的日期</h3><p>{{ period(result) }}</p><p v-if="result.skipped_rows" class="transfer-note">已略過 {{ result.skipped_rows.toLocaleString() }} 筆收入或非支援類別。</p><p class="transfer-note">現在可在每日明細和統計查看。</p></div>
      <button class="primary transfer-action" @click="reset">繼續匯入其他檔案</button>
    </template>
    <template v-else>
      <ol class="transfer-steps" aria-label="匯入步驟"><li :class="{ current: !preview }">1 選擇檔案</li><li :class="{ current: preview }">2 預覽確認</li><li>3 完成</li></ol>
      <div v-if="!preview" class="transfer-card">
        <label class="field-label" for="import-source">檔案來源</label>
        <select id="import-source" v-model="source" class="transfer-select" :disabled="busy"><option value="fortune-city">Fortune City（記帳城市）</option><option value="bookkeeper">日常記帳（本 app 匯出的 CSV）</option></select>
        <div class="file-picker" :class="{ 'has-file': file }"><span class="file-symbol" aria-hidden="true">⇧</span><strong class="file-name">{{ file?.name || '選擇要匯入的 CSV' }}</strong><p>{{ file ? `${(file.size / 1024).toFixed(1)} KB · UTF-8 CSV` : 'CSV 格式 · 最大 5 MB' }}</p>
          <label class="file-button" :class="{ disabled: busy }" for="import-file">{{ file ? '重新選擇檔案' : '選擇 CSV 檔案' }}</label><input id="import-file" :key="inputKey" class="file-input" type="file" accept=".csv,text/csv" :disabled="busy" aria-label="選擇 CSV 檔案" @change="chooseFile">
        </div>
        <p class="transfer-note">只匯入八個既有花費類別。收入與其他類別會略過。</p><p v-if="source === 'fortune-city'" class="transfer-note">忽略 Account 與 Account ID。來源日期以台北時間（UTC+8）解讀。</p>
      </div>
      <template v-else>
        <div class="selected-file-bar"><div><small>{{ source === 'fortune-city' ? 'Fortune City' : '日常記帳 CSV' }}</small><strong class="file-name">{{ file.name }}</strong></div><button class="small-button" :disabled="busy" @click="preview = null; error = ''">更換</button></div>
        <div class="transfer-card">
          <h3>匯入預覽</h3><div class="transfer-summary"><div><span>可匯入</span><strong>{{ preview.imported_rows.toLocaleString() }} 筆</strong></div><div><span>花費總額</span><strong>{{ money(preview.amount) }}</strong></div></div><p class="transfer-period">{{ period(preview) }}</p>
          <p class="transfer-note">檔案共 {{ preview.total_rows.toLocaleString() }} 筆；略過 {{ preview.skipped_rows.toLocaleString() }} 筆收入或非支援類別。</p>
          <template v-if="sample.length"><div class="preview-heading">前 {{ sample.length }} 筆可匯入花費</div><ExpenseList :records="sample" full-date /></template>
          <div v-if="preview.duplicate" class="transfer-warning" role="alert">這份檔案已於 {{ dayKey(preview.duplicate.imported_at_ms) }} 匯入過，不會重複新增。</div>
          <div v-else-if="preview.error_count" class="transfer-warning" role="alert"><strong>{{ preview.error_count }} 筆格式錯誤，請修正後重新選檔。</strong><ul><li v-for="item in preview.errors" :key="item.row">第 {{ item.row }} 筆：{{ item.message }}</li></ul><p v-if="preview.error_count > preview.errors.length">僅顯示前 {{ preview.errors.length }} 個錯誤。</p><p>目前尚未寫入任何紀錄。</p></div>
          <p v-else-if="!preview.imported_rows" class="transfer-note">沒有符合類別的花費紀錄可以匯入。</p>
          <p class="transfer-note">新增紀錄，保留目前已有的花費。不同檔案的重疊紀錄仍會新增。</p>
        </div>
      </template>
      <p v-if="error && !confirming" class="form-error transfer-error" role="alert">{{ error }}</p>
      <button v-if="!preview" class="primary transfer-action" :disabled="!file || busy" @click="inspect">{{ busy ? '正在分析檔案…' : '預覽匯入內容' }}</button>
      <button v-else class="primary transfer-action" :disabled="!preview.can_import || busy" @click="confirming = true; error = ''">匯入 {{ preview.imported_rows.toLocaleString() }} 筆花費</button>
    </template>
    <ModalSheet v-if="confirming" title="確認匯入？" subtitle="新增這批花費，保留原有紀錄。" :busy="busy" @close="confirming = false">
      <div class="sheet-body"><p class="file-name">{{ file.name }}</p><div class="transfer-summary"><div><span>新增筆數</span><strong>{{ preview.imported_rows.toLocaleString() }} 筆</strong></div><div><span>花費總額</span><strong>{{ money(preview.amount) }}</strong></div></div><p class="transfer-period">{{ period(preview) }}</p><p v-if="error" class="form-error" role="alert">{{ error }}</p></div>
      <div class="sheet-footer"><button :disabled="busy" autofocus @click="confirming = false">返回檢查</button><button class="primary" :disabled="busy" @click="commit">{{ busy ? '匯入中…' : '確認匯入' }}</button></div>
    </ModalSheet>
  </section>
</template>
