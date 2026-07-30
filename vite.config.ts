import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const productionApiProxy = {
  target: 'https://api.opendfieldmap.org',
  changeOrigin: true,
  secure: true,
  cookieDomainRewrite: '',
  rewrite: (path: string) => path.replace(/^\/api/, ''),
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5429,
    strictPort: true,
    proxy: {
      '/api': productionApiProxy,
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
