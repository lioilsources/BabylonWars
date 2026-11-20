import { defineConfig } from 'vitest/config';

// base: na GitHub Pages běží hra pod /<repo>/, lokálně z kořene
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { host: true },
  test: { include: ['test/**/*.test.ts'] },
});
