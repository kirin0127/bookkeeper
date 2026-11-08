import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001', changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', request => request.setHeader('X-Forwarded-Proto', 'https'));
        },
      },
    },
  },
});
