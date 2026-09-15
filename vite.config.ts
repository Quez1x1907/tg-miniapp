import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' — чтобы бандл работал с любого пути GitHub Pages (/tg-miniapp/...)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
