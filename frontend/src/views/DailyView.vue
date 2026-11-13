<script setup>
import { computed, ref } from 'vue';
import ExpenseList from '../components/ExpenseList.vue';
import ExpenseForm from '../components/ExpenseForm.vue';
import CalendarPicker from '../components/CalendarPicker.vue';
import ModalSheet from '../components/ModalSheet.vue';
import { dayRange, shiftDay, prettyDate, weekday, money, sum } from '../lib/format';
import { useRecords } from '../lib/useRecords';
import { useSwipe } from '../lib/useSwipe';
import { deleteExpense } from '../api';
const props = defineProps({ categories: Array, day: String, today: String });
const emit = defineEmits(['update:day', 'notify']);
const { records, loading, error, reload } = useRecords(computed(() => dayRange(props.day)));
const adding = ref(false), calendar = ref(false), deleting = ref(null), deletingBusy = ref(false), deleteError = ref('');
const editing = ref(null);
const relation = computed(() => props.day === props.today ? '今天' : props.day === shiftDay(props.today, -1) ? '昨天' : '');
function selectDay(value) { emit('update:day', value); calendar.value = false; }
function move(step) {
  const next = shiftDay(props.day, step);
  if (next <= props.today && next >= '1900-01-01') selectDay(next);
}
const swipe = useSwipe(move);
function saved(record) {
  const wasEditing = Boolean(editing.value);
  adding.value = false; editing.value = null; reload();
  emit('notify', `${wasEditing ? '已更新' : '已新增'} ${money(record.amount)}`);
}
function requestDelete(record) { deleting.value = record; deleteError.value = ''; }
async function confirmDelete() {
  if (deletingBusy.value) return;
  deletingBusy.value = true; deleteError.value = '';
  try {
    await deleteExpense(deleting.value.id);
    deleting.value = null;
    await reload();
    emit('notify', '已刪除這筆花費');
  } catch (failure) { deleteError.value = failure.message; }
  finally { deletingBusy.value = false; }
}
</script>

<template>
  <main @pointerdown="swipe.pointerdown" @pointermove="swipe.pointermove" @pointerup="swipe.pointerup" @pointercancel="swipe.pointercancel" @click.capture="swipe.click">
    <div class="page-heading"><h1>每日明細</h1><button class="small-button" :disabled="day === today" @click="selectDay(today)">回到今天</button></div>
    <div class="period-nav">
      <button class="arrow" aria-label="上一天" :disabled="day === '1900-01-01'" @click="move(-1)">‹</button>
      <button class="period-label date-trigger" aria-haspopup="dialog" :aria-label="`選擇日期，目前為${prettyDate(day)}`" @click="calendar = true"><strong>{{ prettyDate(day) }} <span class="calendar-caret">▾</span></strong><span>{{ [relation, weekday(day)].filter(Boolean).join(' · ') }}</span></button>
      <button class="arrow" aria-label="下一天" :disabled="day >= today" @click="move(1)">›</button>
    </div>
    <p class="swipe-hint">← 左滑前一天　右滑後一天 →</p>
    <div v-if="loading" class="loading-state" role="status">正在載入明細…</div>
    <div v-else-if="error" class="error-state" role="alert"><p>{{ error }}</p><button @click="reload">重新載入</button></div>
    <template v-else>
      <section class="day-summary" aria-label="當日花費摘要"><div><p class="summary-label">{{ relation || '當日' }}花費</p><p class="summary-count">共 {{ records.length }} 筆</p></div><strong>{{ money(sum(records)) }}</strong></section>
      <template v-if="records.length"><div class="list-heading"><h3>花費明細</h3><span>時間由新到舊 · 點選可編輯</span></div><ExpenseList :records="records" deletable editable @edit="editing = $event" @delete="requestDelete" /></template>
      <div v-else class="empty-state"><strong>這一天還沒有花費紀錄</strong><p>點下方按鈕，新增第一筆花費。</p></div>
    </template>
    <div class="add-area"><button class="primary add-button" @click="adding = true"><span aria-hidden="true">＋</span>新增花費</button></div>
  </main>
  <ExpenseForm v-if="adding || editing" :categories="categories" :day="day" :record="editing" @close="adding = false; editing = null" @saved="saved" />
  <CalendarPicker v-if="calendar" :day="day" :today="today" @close="calendar = false" @select="selectDay" />
  <ModalSheet v-if="deleting" title="刪除這筆花費？" subtitle="刪除後，當日明細與統計會一起更新。" :busy="deletingBusy" @close="deleting = null">
    <ExpenseList :records="[deleting]" />
    <p v-if="deleteError" class="form-error error-padding" role="alert">{{ deleteError }}</p>
    <div class="sheet-footer"><button :disabled="deletingBusy" autofocus @click="deleting = null">取消</button><button class="primary danger" :disabled="deletingBusy" @click="confirmDelete">{{ deletingBusy ? '刪除中…' : '確認刪除' }}</button></div>
  </ModalSheet>
</template>
