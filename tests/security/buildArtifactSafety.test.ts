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
    expect(deployment).toContain('真实 blocker');
    expect(deployment).toContain('cloudbase-test-environment.md');
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
      'CLOUDBASE_MANUAL_E2E=1',
      '中国大陆网络 smoke',
    ]) {
      expect(environment).toContain(requiredTerm);
    }
    expect(environment).toContain('不记录真实邮箱、验证码、session、token、照片对象 key 或模型响应原文');
    expect(environment).not.toContain('本文档只用于验证邮箱 OTP、会话恢复、退出、两账号 RLS 与跨设备资料同步');
  });

  it('keeps the service worker away from user APIs and test-platform endpoints', () => {
    const viteConfig = readProjectFile('vite.config.ts');

    expect(viteConfig).not.toMatch(/runtimeCaching\s*:/);
    expect(viteConfig).toContain('navigateFallbackDenylist');
    expect(viteConfig).toContain('/^\\/__/');
    expect(viteConfig).toContain('/^\\/api\\//');
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
