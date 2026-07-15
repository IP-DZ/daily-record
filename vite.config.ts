import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

function stripTestPlatformFromProduction(mode: string): PluginOption {
  return {
    name: 'strip-test-platform-from-production',
    enforce: 'pre',
    transform(code, id) {
      if (mode === 'test' || !id.endsWith('/src/app/App.tsx')) return null;

      return {
        code: code.replace(
          /function isTestPlatformRequested\(\): boolean \{[\s\S]*?\n\}\n\nfunction resolvePlatformLoader\(platformLoader: PlatformLoader\): PlatformLoader \{[\s\S]*?\n\}/,
          `function isTestPlatformRequested(): boolean {
  return false;
}

function resolvePlatformLoader(platformLoader: PlatformLoader): PlatformLoader {
  return platformLoader;
}`,
        ),
        map: null,
      };
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    stripTestPlatformFromProduction(mode),
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '每日记录',
        short_name: '每日记录',
        description: '记录每日饮食、训练和体重',
        theme_color: '#173b2f',
        background_color: '#f6f3ea',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,txt}'],
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    setupFiles: './src/test/setup.ts',
  },
}));
