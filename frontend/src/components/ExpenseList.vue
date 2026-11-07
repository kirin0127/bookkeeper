<script setup>
import { categoryColor, categoryStyle } from '../lib/categories';
import { money, dayKey, timeText } from '../lib/format';
defineProps({ records: Array, fullDate: Boolean, deletable: Boolean });
defineEmits(['delete']);
</script>

<template>
  <div class="expense-list">
    <div v-for="record in records" :key="record.id" class="expense-row">
      <span class="category-icon" :style="categoryStyle(record.category)" aria-hidden="true">{{ categoryColor(record.category).glyph }}</span>
      <div class="expense-info">
        <strong>{{ record.note || record.category }}</strong>
        <small>{{ record.category }} · {{ fullDate ? dayKey(record.recorded_at_ms) + ' ' : '' }}{{ timeText(record.recorded_at_ms) }}</small>
      </div>
      <div class="expense-actions">
        <strong class="expense-price">{{ money(record.amount) }}</strong>
        <button v-if="deletable" class="delete-record" :aria-label="`刪除${record.note || record.category} ${money(record.amount)}`" @click="$emit('delete', record)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>
