<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
const props = defineProps({ title: String, subtitle: String, busy: Boolean });
const emit = defineEmits(['close']);
const dialog = ref(null);
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
function cancel(event) { event.preventDefault(); if (!props.busy) emit('close'); }
</script>

<template>
  <dialog ref="dialog" :aria-label="title" @cancel="cancel">
    <div class="sheet-header">
      <div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div>
      <button class="close" type="button" :disabled="busy" aria-label="關閉彈窗" @click="emit('close')">×</button>
    </div>
    <slot />
  </dialog>
</template>
