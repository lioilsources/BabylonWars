import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Po buildu vygeneruje dist/sw.js se seznamem souborů k předcachování (bez zvuků) */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'bw-service-worker',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string): void => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = ['./', ...files.filter((f) => f !== 'sw.js' && !f.startsWith('assets/sounds/') && !f.endsWith('.map'))];
      const tpl = readFileSync('scripts/pwa/sw.template.js', 'utf8');
      writeFileSync(join(outDir, 'sw.js'), tpl
        .replace('__VERSION__', Date.now().toString(36))
        .replace('__PRECACHE__', JSON.stringify(precache)));
    },
  };
}

// base: na GitHub Pages běží hra pod /<repo>/, lokálně z kořene
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [serviceWorker()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { host: true },
  test: { include: ['test/**/*.test.ts'] },
});
