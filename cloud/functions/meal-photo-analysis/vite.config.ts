import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';

function writeDeploymentPackageMetadata(): PluginOption {
  return {
    name: 'write-deployment-package-metadata',
    apply: 'build',
    closeBundle() {
      writeFileSync(
        resolve(__dirname, 'dist/package.json'),
        `${JSON.stringify({
          type: 'module',
          main: 'index.js',
          dependencies: {
            '@cloudbase/node-sdk': '3.18.3',
          },
        }, null, 2)}\n`,
      );
    },
  };
}

export default defineConfig({
  plugins: [writeDeploymentPackageMetadata()],
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
      external: ['node:crypto', '@cloudbase/node-sdk'],
    },
    sourcemap: true,
    target: 'node20',
  },
});
