<script setup>
import { computed } from 'vue';
import { categoryColor, categoryStyle } from '../lib/categories';
import { money } from '../lib/format';
const props = defineProps({ totals: Array, selected: Number });
const emit = defineEmits(['select']);
const selection = computed(() => props.totals.find(item => item.id === props.selected));
const slices = computed(() => {
  const total = props.totals.reduce((sum, item) => sum + item.amount, 0);
  let angle = -Math.PI / 2;
  return props.totals.filter(item => item.amount > 0).map(item => {
    const fraction = item.amount / total, end = angle + fraction * Math.PI * 2;
    const x1 = 100 + 94 * Math.cos(angle), y1 = 100 + 94 * Math.sin(angle);
    const x2 = 100 + 94 * Math.cos(end), y2 = 100 + 94 * Math.sin(end);
    const d = `M100 100 L${x1} ${y1} A94 94 0 ${fraction > .5 ? 1 : 0} 1 ${x2} ${y2} Z`;
    angle = end;
    return { ...item, d, full: fraction === 1, label: `${item.name} ${money(item.amount)}，${(fraction * 100).toFixed(1)}%` };
  });
});
</script>

<template>
  <div v-if="slices.length" class="pie-wrap">
    <svg class="pie-chart" viewBox="0 0 200 200" role="group" aria-label="各類花費占比，點選色塊切換分類加總">
      <g v-for="slice in slices" :key="slice.id" class="pie-segment" :class="{ selected: selected === slice.id }" role="button" tabindex="0" :aria-label="slice.label" :aria-pressed="selected === slice.id" @click="emit('select', slice.id)" @keydown.enter.prevent="emit('select', slice.id)" @keydown.space.prevent="emit('select', slice.id)">
        <circle v-if="slice.full" cx="100" cy="100" r="94" :fill="categoryColor(slice.name).color"><title>{{ slice.label }}</title></circle>
        <path v-else :d="slice.d" :fill="categoryColor(slice.name).color" stroke="white" stroke-width="2"><title>{{ slice.label }}</title></path>
      </g>
    </svg>
    <div class="pie-selection" :class="{ 'has-selection': selection }" :style="selection ? categoryStyle(selection.name) : {}" role="status">
      <template v-if="selection"><span class="pie-label-dot" aria-hidden="true" /><strong>{{ selection.name }}</strong><span>再點一次取消</span></template>
      <template v-else>點選色塊查看類別</template>
    </div>
  </div>
  <div v-else class="empty-state"><strong>這段期間還沒有花費</strong><p>新增紀錄後，這裡會顯示分類占比。</p></div>
</template>
