<script setup>
import { ref } from 'vue';
const props = defineProps({ busy: Boolean, error: String, notice: String });
const emit = defineEmits(['submit']);
const username = ref(''), password = ref(''), visible = ref(false);
function submit() {
  if (!props.busy) emit('submit', { username: username.value, password: password.value });
}
</script>

<template>
  <div class="phone">
    <header class="app-header"><span class="app-name">日常記帳</span><span class="timezone-label">台北時間 · TWD</span></header>
    <main class="login-page">
      <form class="login-form" aria-labelledby="login-title" :aria-busy="busy" @submit.prevent="submit">
        <div class="login-mark" aria-hidden="true">帳</div>
        <h1 id="login-title">登入日常記帳</h1>
        <p class="login-description">把每天的花費，留在自己的帳本裡。</p>
        <p v-if="notice" class="login-notice" role="status">{{ notice }}</p>
        <label for="login-username" class="field-label">帳號</label>
        <input id="login-username" v-model="username" class="note-input" name="username" autocomplete="username" autocapitalize="none" :spellcheck="false" maxlength="64" required :disabled="busy">
        <label for="login-password" class="field-label login-password-label">密碼</label>
        <div class="password-input">
          <input id="login-password" v-model="password" class="note-input" name="password" :type="visible ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required :disabled="busy">
          <button type="button" :aria-pressed="visible" aria-controls="login-password" :disabled="busy" @click="visible = !visible">{{ visible ? '隱藏' : '顯示' }}</button>
        </div>
        <p id="login-error" class="login-error" role="alert">{{ error }}</p>
        <button class="primary login-submit" type="submit" :disabled="busy">{{ busy ? '登入中…' : '登入' }}</button>
      </form>
    </main>
  </div>
</template>
