<script setup>
import { computed, ref } from 'vue';
import ModalSheet from './ModalSheet.vue';
import { categoryColor, categoryStyle } from '../lib/categories';
import { prettyDate, recordedTime } from '../lib/format';
import { addExpense } from '../api';
const props = defineProps({ categories: Array, day: String });
const emit = defineEmits(['close', 'saved']);
const amount = ref(''), note = ref(''), selected = ref(null), busy = ref(false), error = ref('');
const chosen = computed(() => props.categories.find(item => item.id === selected.value));
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
    const record = await addExpense({ category_id: selected.value, amount: value, note: note.value, recorded_at_ms: recordedTime(props.day) });
    emit('saved', record);
  } catch (failure) { error.value = failure.message; }
  finally { busy.value = false; }
}
</script>

<template>
  <ModalSheet title="新增花費" :subtitle="prettyDate(day)" :busy="busy" @close="emit('close')">
    <form @submit.prevent="save">
      <div class="sheet-body">
        <label class="field-label" for="amount">金額 <span>必填・整數元</span></label>
        <div class="amount-field"><span>NT$</span><input id="amount" v-model="amount" inputmode="numeric" autocomplete="off" placeholder="0" required autofocus :disabled="busy" aria-describedby="form-error"></div>
        <label class="field-label" for="note">說明 <span>選填</span></label>
        <input id="note" v-model="note" class="note-input" placeholder="例如：午餐、咖啡" maxlength="200" :disabled="busy">
        <fieldset :disabled="busy"><legend class="field-label">類別 <span>必選一個</span></legend>
          <div class="category-grid">
            <button v-for="category in categories.filter(item => item.is_active)" :key="category.id" type="button" class="category-option" :class="{ selected: selected === category.id }" :style="categoryStyle(category.name)" :aria-pressed="selected === category.id" @click="selected = category.id">
              <span class="glyph" aria-hidden="true">{{ categoryColor(category.name).glyph }}</span>{{ category.name }}
            </button>
          </div>
        </fieldset>
        <div class="selected-category" :class="{ 'has-selection': chosen }" :style="chosen ? categoryStyle(chosen.name) : {}" aria-live="polite"><span>目前選擇的類別</span><strong>{{ chosen?.name || '尚未選擇' }}</strong></div>
        <p id="form-error" class="form-error" role="alert">{{ error }}</p>
      </div>
      <div class="sheet-footer"><button type="button" :disabled="busy" @click="emit('close')">取消</button><button class="primary" type="submit" :disabled="busy">{{ busy ? '儲存中…' : '儲存花費' }}</button></div>
    </form>
  </ModalSheet>
</template>
