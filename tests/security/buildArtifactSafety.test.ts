// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const distRoot = resolve(repoRoot, 'dist');

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

  it('keeps the service worker away from user APIs and test-platform endpoints', () => {
    const viteConfig = readProjectFile('vite.config.ts');

    expect(viteConfig).not.toMatch(/runtimeCaching\s*:/);
    expect(viteConfig).toContain('navigateFallbackDenylist');
    expect(viteConfig).toContain('/^\\/__/');
    expect(viteConfig).toContain('/^\\/api\\//');
  });

  it.runIf(existsSync(distRoot))('keeps production build artifacts free of test and server-secret markers', () => {
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
