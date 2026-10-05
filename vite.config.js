import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// MapLibre v6 の Web Worker は本体と別ファイルで読み込まれるため、
// public/ にコピーして固定パスで配信する
function copyMaplibreWorker() {
  const src = path.resolve('node_modules/maplibre-gl/dist');
  const dest = path.resolve('public/vendor/maplibre');
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
  return {
    name: 'copy-maplibre-worker',
    buildStart() {
      fs.mkdirSync(dest, { recursive: true });
      for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyMaplibreWorker()],
  server: { host: true },
});
