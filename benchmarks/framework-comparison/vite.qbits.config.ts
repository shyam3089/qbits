import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {languagePlugin} from '../../tooling/vite';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  base: './',
  plugins: [languagePlugin()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/qbits'),
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {input: resolve(import.meta.dirname, 'src/index.html')}
  },
  resolve: {alias: {'./main.ts': resolve(import.meta.dirname, 'src/qbits/main.ts')}}
});

