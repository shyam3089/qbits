import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/vue'),
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {input: resolve(import.meta.dirname, 'src/index.html')}
  },
  resolve: {alias: {'./main.ts': resolve(import.meta.dirname, 'src/vue/main.ts')}}
});

