<script setup>
import { nextTick, ref } from 'vue';
import ImportPanel from '../components/ImportPanel.vue';
import ExportPanel from '../components/ExportPanel.vue';
defineProps({ today: String });
const emit = defineEmits(['busy']);
const mode = ref('import'), busy = ref(false), tabs = ref(null);
function setBusy(value) { busy.value = value; emit('busy', value); }
async function keydown(event) {
  if (busy.value || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  mode.value = event.key === 'Home' ? 'import' : event.key === 'End' ? 'export' : mode.value === 'import' ? 'export' : 'import';
  await nextTick(); tabs.value.querySelector('[aria-selected="true"]').focus();
}
</script>

<template>
  <main>
    <div class="page-heading"><h1>匯入匯出</h1></div>
    <div ref="tabs" class="transfer-tabs" role="tablist" aria-label="匯入或匯出" @keydown="keydown">
      <button v-for="value in ['import', 'export']" :id="`tab-${value}`" :key="value" role="tab" :aria-controls="`panel-${value}`" :aria-selected="mode === value" :tabindex="mode === value ? 0 : -1" :disabled="busy" @click="mode = value">{{ value === 'import' ? '匯入' : '匯出' }}</button>
    </div>
    <div class="transfer-panel">
      <div v-show="mode === 'import'" id="panel-import" role="tabpanel" aria-labelledby="tab-import"><ImportPanel @busy="setBusy" /></div>
      <div v-show="mode === 'export'" id="panel-export" role="tabpanel" aria-labelledby="tab-export"><ExportPanel :active="mode === 'export'" :today="today" @busy="setBusy" /></div>
    </div>
  </main>
</template>
