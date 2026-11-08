<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import BookkeeperView from './views/BookkeeperView.vue';
import LoginView from './views/LoginView.vue';
import { getMe, login, logout, invalidateRequests } from './api';

const state = ref('checking'), account = ref(null), error = ref(''), notice = ref('');
const loggingIn = ref(false), loggingOut = ref(false), logoutError = ref('');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bookkeeper-auth') : null;
let version = 0;
function clearAccount() {
  version++;
  invalidateRequests();
  account.value = null;
  error.value = '';
  logoutError.value = '';
  loggingIn.value = false;
  loggingOut.value = false;
}
async function checkSession() {
  clearAccount();
  notice.value = '';
  state.value = 'checking';
  const current = version;
  try {
    const user = await getMe();
    if (current !== version) return;
    account.value = user;
    state.value = 'authenticated';
  } catch (failure) {
    if (current !== version) return;
    if (failure.status === 401) state.value = 'anonymous';
    else { state.value = 'error'; error.value = failure.message; }
  }
}
async function signIn(credentials) {
  if (loggingIn.value) return;
  loggingIn.value = true;
  error.value = ''; notice.value = '';
  const current = version;
  try {
    const user = await login(credentials);
    if (current !== version) return;
    invalidateRequests();
    account.value = user;
    state.value = 'authenticated';
    channel?.postMessage('changed');
  } catch (failure) {
    if (current === version) error.value = failure.message;
  } finally { if (current === version) loggingIn.value = false; }
}
async function signOut() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  logoutError.value = '';
  const current = version;
  try {
    await logout();
    if (current !== version) return;
    clearAccount();
    state.value = 'anonymous';
    notice.value = '你已登出。';
    channel?.postMessage('changed');
  } catch (failure) {
    if (current === version) logoutError.value = `登出未完成：${failure.message}`;
  } finally { if (current === version) loggingOut.value = false; }
}
function expired() {
  clearAccount();
  state.value = 'anonymous';
  notice.value = '登入已過期，請重新登入。';
}
function changed() { checkSession(); }
onMounted(() => {
  window.addEventListener('auth-expired', expired);
  if (channel) channel.onmessage = changed;
  checkSession();
});
onBeforeUnmount(() => { version++; window.removeEventListener('auth-expired', expired); channel?.close(); });
</script>

<template>
  <BookkeeperView v-if="state === 'authenticated'" :key="account.id" :account="account" :logging-out="loggingOut" :logout-error="logoutError" @logout="signOut" />
  <LoginView v-else-if="state === 'anonymous'" :busy="loggingIn" :error="error" :notice="notice" @submit="signIn" />
  <div v-else class="phone">
    <header class="app-header"><span class="app-name">日常記帳</span></header>
    <main>
      <div v-if="state === 'checking'" class="loading-state" role="status">正在確認登入狀態…</div>
      <div v-else class="error-state" role="alert"><p>{{ error }}</p><button @click="checkSession">重新連線</button></div>
    </main>
  </div>
</template>
