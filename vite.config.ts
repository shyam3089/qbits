import { defineConfig } from 'vite';
import { languagePlugin } from './tooling/vite';
export default defineConfig({plugins: [languagePlugin()], build: {outDir: 'dist/site'}});
