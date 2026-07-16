import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    minify: false,
    outDir: 'dist',
    rollupOptions: {
      external: ['node:crypto'],
    },
    sourcemap: true,
    target: 'node20',
  },
});
