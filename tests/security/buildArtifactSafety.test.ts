// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const distRoot = resolve(repoRoot, 'dist');
const buildModeMarker = resolve(distRoot, '.build-mode');
const hasProductionDist = existsSync(buildModeMarker)
  && readFileSync(buildModeMarker, 'utf8').trim() === 'production';

function readProjectFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function readJsonProjectFile<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T;
}

function collectTextFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const absolutePath = resolve(root, entry);
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) return collectTextFiles(absolutePath);
      const extension = extname(absolutePath);
      return ['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.webmanifest'].includes(extension)
        ? [absolutePath]
        : [];
    });
}

describe('deployment and build artifact safety', () => {
  it('documents deployment, mainland China smoke checks, budgets, and known blockers', () => {
    const deployment = readProjectFile('docs/operations/deployment.md');

    expect(deployment).toContain('CloudBase 静态托管');
    expect(deployment).toContain('自托管部署');
    expect(deployment).toContain('中国大陆网络 smoke');
    expect(deployment).toContain('LCP 预算');
    expect(deployment).toContain('包体预算');
    expect(deployment).toContain('PHOTO_MEAL_MODEL_PROVIDER');
    expect(deployment).toContain('PHOTO_MEAL_MODEL_ENDPOINT');
    expect(deployment).toContain('PHOTO_MEAL_MODEL_NAME');
    expect(deployment).toContain('PHOTO_MEAL_DAILY_LIMIT');
    expect(deployment).toContain('PHOTO_MEAL_MODEL_API_KEY');
    expect(deployment).toContain('CLOUDBASE_ENV_ID');
    expect(deployment).toContain('CLOUDBASE_PUBLISHABLE_KEY');
    expect(deployment).toContain('真实 blocker');
    expect(deployment).toContain('cloudbase-test-environment.md');
    expect(deployment).toContain('manual-smoke-result-template.md');
    expect(deployment).toContain('local-development.md');
  });

  it('keeps the environment example limited to client-public placeholders', () => {
    const example = readProjectFile('.env.example');

    expect(example).toContain('# 仅限浏览器公开配置，不要写入服务端密钥或验证码');
    expect(example).toContain('VITE_CLOUDBASE_ENV_ID=');
    expect(example).toContain('VITE_CLOUDBASE_REGION=ap-shanghai');
    expect(example).toContain('VITE_CLOUDBASE_PUBLISHABLE_KEY=');
    expect(example).not.toMatch(/(SECRET|TOKEN|OTP|246810|example\.test|TENCENTCLOUD|CLOUDBASE_APIKEY)/i);
  });

  it('documents the full CloudBase isolation smoke scope beyond onboarding data', () => {
    const environment = readProjectFile('docs/operations/cloudbase-test-environment.md');

    for (const requiredTerm of [
      'profiles',
      'nutrition_goals',
      'meals',
      'weight_entries',
      'workouts',
      'workout_exercises',
      'workout_sets',
      'ai_analyses',
      'delete_my_application_data',
      'mealPhotoAnalysis',
      'PHOTO_MEAL_MODEL_PROVIDER',
      'PHOTO_MEAL_MODEL_API_KEY',
      'CLOUDBASE_ENV_ID',
      'CLOUDBASE_PUBLISHABLE_KEY',
      'CLOUDBASE_MANUAL_E2E=1',
      '中国大陆网络 smoke',
    ]) {
      expect(environment).toContain(requiredTerm);
    }
    expect(environment).toContain('不记录真实邮箱、验证码、session、token、照片对象 key 或模型响应原文');
    expect(environment).toContain('manual-smoke-result-template.md');
    expect(environment).not.toContain('本文档只用于验证邮箱 OTP、会话恢复、退出、两账号 RLS 与跨设备资料同步');
  });

  it('keeps manual smoke evidence templated and redacted', () => {
    const manualSmokeTemplate = readProjectFile('docs/operations/manual-smoke-result-template.md');

    for (const requiredTerm of [
      '执行环境',
      'Preflight',
      'Manual Spec',
      '业务 Smoke',
      '中国大陆网络 Smoke',
      '结果',
      '阻塞项',
      '不得记录真实邮箱',
      '验证码',
      'session',
      'token',
      '照片对象 key',
      '签名 URL',
      '模型响应原文',
      'secret',
    ]) {
      expect(manualSmokeTemplate).toContain(requiredTerm);
    }
    expect(manualSmokeTemplate).not.toMatch(/[\w.+-]+@[\w.-]+/);
    expect(manualSmokeTemplate).not.toContain('246810');
    expect(manualSmokeTemplate).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(manualSmokeTemplate).not.toContain('cloud://');
  });

  it('keeps the meal photo cloud function as a buildable deployment package', () => {
    const workspace = readProjectFile('pnpm-workspace.yaml');
    const rootPackage = readJsonProjectFile<{ scripts?: Record<string, unknown> }>('package.json');
    const functionPackage = readJsonProjectFile<{
      main?: unknown;
      files?: unknown;
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
    }>('cloud/functions/meal-photo-analysis/package.json');
    const tsconfig = readJsonProjectFile<{ compilerOptions?: Record<string, unknown>; include?: unknown }>(
      'cloud/functions/meal-photo-analysis/tsconfig.json',
    );

    expect(workspace).toContain('cloud/functions/*');
    expect(rootPackage.scripts).toEqual(expect.objectContaining({
      'test:cloud-functions': 'pnpm --filter meal-photo-analysis test',
      'typecheck:cloud-functions': 'pnpm --filter meal-photo-analysis typecheck',
      'build:cloud-functions': 'pnpm --filter meal-photo-analysis build',
      'smoke:cloud-functions': 'pnpm --filter meal-photo-analysis smoke',
      'preflight:cloudbase-manual': 'node scripts/cloudbase-manual-preflight.mjs',
    }));
    const manualPreflight = readProjectFile('scripts/cloudbase-manual-preflight.mjs');
    expect(manualPreflight).toContain('CloudBase manual smoke preflight passed');
    expect(manualPreflight).toContain('PHOTO_MEAL_MODEL_API_KEY');
    expect(manualPreflight).toContain('VITE_CLOUDBASE_ENV_ID');
    expect(manualPreflight).not.toMatch(/console\.(log|error)\([^)]*process\.env/);
    expect(functionPackage.main).toBe('dist/index.js');
    expect(functionPackage.files).toEqual(['dist']);
    expect(functionPackage.scripts).toEqual(expect.objectContaining({
      build: 'vite build --config vite.config.ts',
      smoke: 'node scripts/smoke-dist.mjs',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      test: 'vitest run src',
    }));
    const smokeScript = readProjectFile('cloud/functions/meal-photo-analysis/scripts/smoke-dist.mjs');
    expect(smokeScript).toContain('dist/package.json');
    expect(smokeScript).toContain('unauthenticated');
    expect(smokeScript).toContain('CLOUDBASE_ENV_ID');
    expect(smokeScript).toContain('createCloudBaseObjectStorageUploadClient');
    expect(smokeScript).toContain('contentType');
    expect(smokeScript).toContain('forbiddenDistMarkers');
    expect(smokeScript).toContain('@cloudbase\\/js-sdk');
    expect(smokeScript).toContain('window');
    expect(smokeScript).toContain('document');
    expect(smokeScript).toContain('assertDistHasNoSourceMaps');
    expect(smokeScript).toContain('model.example.invalid');
    expect(smokeScript).not.toContain('server-only-secret');
    expect(functionPackage.dependencies).toEqual(expect.objectContaining({
      '@cloudbase/node-sdk': '3.18.3',
      '@daily-record/contracts': 'workspace:*',
      zod: expect.any(String),
    }));
    expect(functionPackage.dependencies).not.toHaveProperty('@cloudbase/js-sdk');
    expect(tsconfig.compilerOptions).toEqual(expect.objectContaining({
      moduleResolution: 'Bundler',
      outDir: 'dist',
    }));
    expect(tsconfig.include).toEqual(['src/**/*.ts']);
    const functionViteConfig = readProjectFile('cloud/functions/meal-photo-analysis/vite.config.ts');
    expect(functionViteConfig).toContain('src/index.ts');
    expect(functionViteConfig).toContain('package.json');
    expect(functionViteConfig).toContain("type: 'module'");
    expect(functionViteConfig).toContain("main: 'index.js'");
    expect(functionViteConfig).toContain("'@cloudbase/node-sdk': '3.18.3'");
    expect(functionViteConfig).toContain("external: ['node:crypto', '@cloudbase/node-sdk']");
    expect(functionViteConfig).toContain('sourcemap: false');
    const functionEntrypoint = readProjectFile('cloud/functions/meal-photo-analysis/src/index.ts');
    expect(functionEntrypoint).toContain("import('@cloudbase/node-sdk')");
    expect(functionEntrypoint).not.toContain('@cloudbase/js-sdk');
    expect(functionEntrypoint).toContain('export async function main');
    expect(readProjectFile('docs/operations/deployment.md')).toContain('pnpm test:cloud-functions');
    expect(readProjectFile('docs/operations/deployment.md')).toContain('pnpm smoke:cloud-functions');
  });

  it('keeps the service worker away from user APIs and test-platform endpoints', () => {
    const viteConfig = readProjectFile('vite.config.ts');

    expect(viteConfig).not.toMatch(/runtimeCaching\s*:/);
    expect(viteConfig).toContain('navigateFallbackDenylist');
    expect(viteConfig).toContain('/^\\/__/');
    expect(viteConfig).toContain('/^\\/api\\//');
    expect(viteConfig).toContain("apply: 'build'");
  });

  it.runIf(hasProductionDist)('keeps production build artifacts free of test and server-secret markers', () => {
    const forbiddenMarkers = [
      /__daily-record-test-platform/,
      /test-platform-client/,
      /246810/,
      /example\.test/i,
      /TENCENTCLOUD_SECRET/i,
      /CLOUDBASE_APIKEY/i,
      /SECRET_KEY/i,
      /OPENAI_API_KEY/i,
      /DASHSCOPE_API_KEY/i,
    ];

    const offenders = collectTextFiles(distRoot).flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenMarkers
        .filter((marker) => marker.test(content))
        .map((marker) => `${filePath.replace(`${repoRoot}/`, '')}: ${marker}`);
    });

    expect(offenders).toEqual([]);
  });
});
