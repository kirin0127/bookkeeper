<script setup>
import { computed, ref } from 'vue';
import ModalSheet from './ModalSheet.vue';
import { categoryColor, categoryStyle } from '../lib/categories';
import { prettyDate, recordedTime } from '../lib/format';
import { addExpense, updateExpense } from '../api';
const props = defineProps({ categories: Array, day: String, record: Object });
const emit = defineEmits(['close', 'saved']);
const amount = ref(props.record ? String(props.record.amount) : ''), note = ref(props.record?.note ?? '');
const selected = ref(props.record?.category_id ?? null), busy = ref(false), error = ref('');
const chosen = computed(() => props.categories.find(item => item.id === selected.value));
const availableCategories = computed(() => props.categories.filter(item => item.is_active || item.id === props.record?.category_id));
async function save() {
  if (busy.value) return;
  error.value = '';
  const raw = amount.value.trim(), value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 1000000000) {
    error.value = '請輸入 1～1,000,000,000 的整數金額。'; return;
  }
  if (!chosen.value) { error.value = '請選擇一個花費類別。'; return; }
  busy.value = true;
  try {
    const body = { category_id: selected.value, amount: value, note: note.value };
    if (props.record) {
      for (const key of Object.keys(body)) if (body[key] === props.record[key]) delete body[key];
      if (!Object.keys(body).length) { emit('saved', props.record); return; }
    }
    const record = props.record
      ? await updateExpense(props.record.id, body)
      : await addExpense({ ...body, recorded_at_ms: recordedTime(props.day) });
    emit('saved', record);
  } catch (failure) { error.value = failure.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <ModalSheet :title="record ? '編輯花費' : '新增花費'" :subtitle="prettyDate(day)" :busy="busy" @close="emit('close')">
    <form @submit.prevent="save">
      <div class="sheet-body">
        <label class="field-label" for="amount">金額 <span>必填・整數元</span></label>
        <div class="amount-field"><span>NT$</span><input id="amount" v-model="amount" inputmode="numeric" autocomplete="off" placeholder="0" required autofocus :disabled="busy" aria-describedby="form-error"></div>
        <label class="field-label" for="note">說明 <span>選填</span></label>
        <textarea id="note" v-model="note" class="note-input" placeholder="例如：午餐、咖啡" maxlength="200" rows="2" :disabled="busy" />
        <fieldset :disabled="busy"><legend class="field-label">類別 <span>必選一個</span></legend>
          <div class="category-grid">
            <button v-for="category in availableCategories" :key="category.id" type="button" class="category-option" :class="{ selected: selected === category.id }" :style="categoryStyle(category.name)" :aria-pressed="selected === category.id" @click="selected = category.id">
              <span class="glyph" aria-hidden="true">{{ categoryColor(category.name).glyph }}</span>{{ category.name }}{{ category.is_active ? '' : '（已停用）' }}
            </button>
          </div>
        </fieldset>
        <div class="selected-category" :class="{ 'has-selection': chosen }" :style="chosen ? categoryStyle(chosen.name) : {}" aria-live="polite"><span>目前選擇的類別</span><strong>{{ chosen?.name || '尚未選擇' }}</strong></div>
        <p id="form-error" class="form-error" role="alert">{{ error }}</p>
      </div>
      <div class="sheet-footer"><button type="button" :disabled="busy" @click="emit('close')">取消</button><button class="primary" type="submit" :disabled="busy">{{ busy ? '儲存中…' : record ? '儲存修改' : '儲存花費' }}</button></div>
    </form>
  </ModalSheet>
</template>
