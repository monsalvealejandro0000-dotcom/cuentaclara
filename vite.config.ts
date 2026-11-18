import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Frontend en web/ → se compila a dist/, que sirve el servidor Node (npm start).
// En desarrollo (npm run dev) Vite reenvía /api al servidor en el puerto 3000.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
