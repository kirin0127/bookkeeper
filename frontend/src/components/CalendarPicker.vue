<script setup>
import { computed, ref } from 'vue';
import ModalSheet from './ModalSheet.vue';
import { dayKey, pad } from '../lib/format';
const props = defineProps({ day: String, today: String });
const emit = defineEmits(['close', 'select']);
const year = ref(Number(props.day.slice(0, 4))), month = ref(Number(props.day.slice(5, 7)));
const years = Array.from({ length: Number(props.today.slice(0, 4)) - 1899 }, (_, index) => Number(props.today.slice(0, 4)) - index);
const cells = computed(() => {
  const first = new Date(Date.UTC(year.value, month.value - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year.value, month.value, 0)).getUTCDate();
  return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${year.value}-${pad(month.value)}-${pad(i + 1)}`)];
});
function move(step) {
  const date = new Date(Date.UTC(year.value, month.value - 1 + step, 1, 12));
  const key = dayKey(date);
  if (key < '1900-01-01' || key.slice(0, 7) > props.today.slice(0, 7)) return;
  year.value = date.getUTCFullYear(); month.value = date.getUTCMonth() + 1;
}
</script>

<template>
  <ModalSheet title="選擇日期" subtitle="點選日期，跳至當天的記帳明細" @close="emit('close')">
    <div class="calendar-body">
      <div class="calendar-navigation">
        <button class="arrow" :disabled="year === 1900 && month === 1" aria-label="日曆上一個月" @click="move(-1)">‹</button>
        <select v-model.number="year" aria-label="日曆年份"><option v-for="value in years" :key="value" :value="value">{{ value }}年</option></select>
        <select v-model.number="month" aria-label="日曆月份"><option v-for="value in 12" :key="value" :value="value">{{ value }}月</option></select>
        <button class="arrow" :disabled="`${year}-${pad(month)}` >= today.slice(0, 7)" aria-label="日曆下一個月" @click="move(1)">›</button>
      </div>
      <div class="calendar-weekdays" aria-hidden="true"><span v-for="value in ['日','一','二','三','四','五','六']" :key="value">{{ value }}</span></div>
      <div class="calendar-days">
        <template v-for="(value, index) in cells" :key="value || `blank-${index}`">
          <button v-if="value" class="calendar-day" :class="{ selected: value === day, today: value === today }" :aria-label="value" :aria-pressed="value === day" :disabled="value > today" @click="emit('select', value)">{{ Number(value.slice(-2)) }}</button>
          <span v-else />
        </template>
      </div>
      <p class="calendar-hint">實框為目前日期，底線標示今天</p>
    </div>
    <div class="sheet-footer"><button @click="emit('close')">取消</button><button class="primary" @click="emit('select', today)">跳到今天</button></div>
  </ModalSheet>
</template>
