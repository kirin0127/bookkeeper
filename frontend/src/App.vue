<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import DailyView from './views/DailyView.vue';
import StatisticsView from './views/StatisticsView.vue';
import TransferView from './views/TransferView.vue';
import { getCategories } from './api';
import { dayKey } from './lib/format';
const tab = ref('daily'), today = ref(dayKey()), day = ref(today.value);
const categories = ref([]), loading = ref(true), error = ref(''), toast = ref('');
const transferBusy = ref(false);
let timer, toastTimer;
async function loadCategories() {
  loading.value = true; error.value = '';
  try { categories.value = await getCategories(); }
  catch (failure) { error.value = failure.message; }
  finally { loading.value = false; }
}
function refreshToday() {
  const current = dayKey();
  if (day.value === today.value) day.value = current;
  today.value = current;
}
function notify(message) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 3000); }
onMounted(() => {
  loadCategories();
  timer = setInterval(refreshToday, 30000);
  document.addEventListener('visibilitychange', refreshToday);
});
onBeforeUnmount(() => { clearInterval(timer); clearTimeout(toastTimer); document.removeEventListener('visibilitychange', refreshToday); });
</script>

<template>
  <div class="phone">
    <header class="app-header"><span class="app-name">日常記帳</span><span class="timezone-label">台北時間 · TWD</span></header>
    <main v-if="loading"><div class="loading-state" role="status">正在載入…</div></main>
    <main v-else-if="error"><div class="error-state" role="alert"><p>{{ error }}</p><button @click="loadCategories">重新連線</button></div></main>
    <DailyView v-else-if="tab === 'daily'" v-model:day="day" :today="today" :categories="categories" @notify="notify" />
    <StatisticsView v-else-if="tab === 'stats'" :today="today" :categories="categories" />
    <TransferView v-else :today="today" @busy="transferBusy = $event" />
    <nav class="bottom-nav" aria-label="主要導覽">
      <button :disabled="transferBusy" :class="{ active: tab === 'stats' }" :aria-current="tab === 'stats' ? 'page' : undefined" @click="tab = 'stats'"><span aria-hidden="true">◴</span>統計</button>
      <button :disabled="transferBusy" :class="{ active: tab === 'daily' }" :aria-current="tab === 'daily' ? 'page' : undefined" @click="tab = 'daily'"><span aria-hidden="true">☷</span>每日明細</button>
      <button :disabled="transferBusy" :class="{ active: tab === 'transfer' }" :aria-current="tab === 'transfer' ? 'page' : undefined" @click="tab = 'transfer'"><span aria-hidden="true">⇅</span>匯入匯出</button>
    </nav>
    <div class="toast" :class="{ show: toast }" role="status">{{ toast }}</div>
  </div>
</template>
