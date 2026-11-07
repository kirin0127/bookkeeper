<script setup>
import { computed, ref, watch } from 'vue';
import CategoryPie from '../components/CategoryPie.vue';
import ExpenseList from '../components/ExpenseList.vue';
import ModalSheet from '../components/ModalSheet.vue';
import { categoryStyle, categoryColor } from '../lib/categories';
import { pad, periodRange, money, sum } from '../lib/format';
import { useRecords } from '../lib/useRecords';
import { useSwipe } from '../lib/useSwipe';
const props = defineProps({ categories: Array, today: String });
const year = ref(Number(props.today.slice(0, 4))), month = ref(Number(props.today.slice(5, 7))), scale = ref('month');
const selected = ref(null), totalsDescending = ref(true), detail = ref(null), sort = ref('amount'), descending = ref(true);
const { records, loading, error, reload } = useRecords(computed(() => periodRange(year.value, month.value, scale.value)));
const periodText = computed(() => `${year.value}年${scale.value === 'month' ? `${month.value}月` : ''}`);
const isCurrent = computed(() => scale.value === 'year' ? year.value >= Number(props.today.slice(0, 4)) : `${year.value}-${pad(month.value)}` >= props.today.slice(0, 7));
const totals = computed(() => props.categories.map(category => {
  const list = records.value.filter(record => record.category_id === category.id);
  return { ...category, amount: sum(list), count: list.length };
}));
const sortedTotals = computed(() => [...totals.value].sort((a, b) => (totalsDescending.value ? b.amount - a.amount : a.amount - b.amount) || a.sort_order - b.sort_order));
const pieTotals = computed(() => [...totals.value].sort((a, b) => b.amount - a.amount || a.sort_order - b.sort_order));
const selection = computed(() => totals.value.find(item => item.id === selected.value));
const allTotal = computed(() => sum(records.value));
const summary = computed(() => selection.value || { name: '總', amount: allTotal.value, count: records.value.length });
const details = computed(() => records.value.filter(record => record.category_id === detail.value?.id).sort((a, b) => {
  const key = sort.value === 'amount' ? 'amount' : 'recorded_at_ms';
  return (descending.value ? b[key] - a[key] : a[key] - b[key]) || b.id - a.id;
}));
function move(step) {
  if (step > 0 && isCurrent.value) return;
  if (scale.value === 'year') {
    if (year.value + step < 1900) return;
    year.value += step;
  } else {
    const date = new Date(Date.UTC(year.value, month.value - 1 + step, 1));
    if (date.getUTCFullYear() < 1900) return;
    year.value = date.getUTCFullYear(); month.value = date.getUTCMonth() + 1;
  }
}
watch([year, month, scale], () => { selected.value = null; });
function setScale(value) {
  if (value === 'month' && year.value === Number(props.today.slice(0, 4)) && month.value > Number(props.today.slice(5, 7))) month.value = Number(props.today.slice(5, 7));
  scale.value = value;
}
function openDetail(category) { detail.value = category; sort.value = 'amount'; descending.value = true; }
function setSort(value) { descending.value = sort.value === value ? !descending.value : true; sort.value = value; }
const swipe = useSwipe(move);
</script>

<template>
  <main @pointerdown="swipe.pointerdown" @pointerup="swipe.pointerup" @pointercancel="swipe.pointercancel" @click.capture="swipe.click">
    <div class="page-heading"><h1>花費統計</h1><div class="segmented" aria-label="統計尺度"><button v-for="value in ['month', 'year']" :key="value" :class="{ active: scale === value }" :aria-pressed="scale === value" @click="setScale(value)">{{ value === 'month' ? '月' : '年' }}</button></div></div>
    <div class="period-nav"><button class="arrow" :aria-label="scale === 'month' ? '上一個月' : '上一年'" :disabled="year === 1900 && (scale === 'year' || month === 1)" @click="move(-1)">‹</button><div class="period-label"><strong>{{ periodText }}</strong><span>{{ scale === 'month' ? '每月統計' : '全年統計' }}</span></div><button class="arrow" :aria-label="scale === 'month' ? '下一個月' : '下一年'" :disabled="isCurrent" @click="move(1)">›</button></div>
    <p class="swipe-hint">← 左滑前一{{ scale === 'month' ? '月' : '年' }}　右滑後一{{ scale === 'month' ? '月' : '年' }} →</p>
    <div v-if="loading" class="loading-state" role="status">正在載入統計…</div>
    <div v-else-if="error" class="error-state" role="alert"><p>{{ error }}</p><button @click="reload">重新載入</button></div>
    <template v-else>
      <div class="stats-total" :class="{ 'has-category': selection }" :style="selection ? categoryStyle(selection.name) : {}" aria-live="polite" aria-atomic="true"><p>{{ scale === 'month' ? '本月' : '本年' }}{{ summary.name }}花費 · {{ summary.count }} 筆</p><strong>{{ money(summary.amount) }}</strong></div>
      <CategoryPie :totals="pieTotals" :selected="selected" @select="id => selected = selected === id ? null : id" />
      <div class="category-heading"><div><h3>各類別加總</h3><span>點選分類查看明細</span></div><button class="small-button" :aria-label="`分類金額${totalsDescending ? '由大到小，點擊改為由小到大' : '由小到大，點擊改為由大到小'}`" @click="totalsDescending = !totalsDescending">金額 {{ totalsDescending ? '↓' : '↑' }}</button></div>
      <div class="category-totals"><button v-for="category in sortedTotals" :key="category.id" class="category-total" :style="categoryStyle(category.name)" @click="openDetail(category)"><span class="swatch" :style="{ background: categoryColor(category.name).color }" /><span class="name">{{ category.name }}</span><span class="value"><strong>{{ money(category.amount) }}</strong><small>{{ allTotal ? (category.amount / allTotal * 100).toFixed(1) : '0.0' }}%</small></span><span class="chevron" aria-hidden="true">›</span></button></div>
    </template>
  </main>
  <ModalSheet v-if="detail" :title="`${detail.name}明細`" :subtitle="periodText" :style="categoryStyle(detail.name)" class="category-detail" @close="detail = null">
    <div class="detail-summary"><span>共 {{ details.length }} 筆</span><strong>{{ money(sum(details)) }}</strong></div>
    <div class="sort-row"><span>排序</span><div class="segmented"><button v-for="value in ['amount', 'date']" :key="value" :class="{ active: sort === value }" :aria-pressed="sort === value" @click="setSort(value)">{{ value === 'amount' ? '金額' : '日期' }} {{ sort === value ? (descending ? '↓' : '↑') : '' }}</button></div></div>
    <p class="sort-description">{{ sort === 'amount' ? (descending ? '金額由大到小' : '金額由小到大') : (descending ? '日期由新到舊' : '日期由舊到新') }}</p>
    <div v-if="details.length" class="detail-list"><ExpenseList :records="details" full-date /></div>
    <div v-else class="empty-state"><strong>這個類別還沒有紀錄</strong></div>
    <div class="detail-footer"><button @click="detail = null">關閉明細</button></div>
  </ModalSheet>
</template>
