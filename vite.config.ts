import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const createApiProxy = (target: string) => ({
  target,
  changeOrigin: true,
  secure: true,
  cookieDomainRewrite: '',
  rewrite: (path: string) => path.replace(/^\/api/, ''),
});

const localApiProxy = createApiProxy('http://127.0.0.1:8787');
const productionApiProxy = createApiProxy('https://api.opendfieldmap.org');

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5429,
    strictPort: true,
    proxy: {
      '/api': localApiProxy,
    },
  },
  preview: {
    host: 'localhost',
    port: 5429,
    strictPort: true,
    proxy: {
      '/api': productionApiProxy,
    },
  },
});
