// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = resolve(repoRoot, 'scripts/cloudbase-manual-preflight.mjs');

const baseEnv = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  VITE_CLOUDBASE_ENV_ID: 'daily-record-isolated',
  VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-client-key',
  VITE_CLOUDBASE_REGION: 'ap-shanghai',
  CLOUDBASE_ENV_ID: 'daily-record-isolated',
  CLOUDBASE_PUBLISHABLE_KEY: 'public-function-key',
  CLOUDBASE_REGION: 'ap-shanghai',
  PHOTO_MEAL_MODEL_PROVIDER: 'http-json',
  PHOTO_MEAL_MODEL_ENDPOINT: 'https://vision-model.internal.example/v1/chat/completions',
  PHOTO_MEAL_MODEL_NAME: 'vision-food-v1',
  PHOTO_MEAL_MODEL_API_KEY: 'sk-realistic-secret-value',
  PHOTO_MEAL_DAILY_LIMIT: '20',
} as const;

function runPreflight(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

describe('CloudBase manual smoke preflight', () => {
  it('passes with complete public, function, and model configuration', () => {
    const result = runPreflight(baseEnv);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CloudBase manual smoke preflight passed');
    expect(result.stdout).toContain('VITE_CLOUDBASE_ENV_ID');
    expect(result.stdout).toContain('PHOTO_MEAL_MODEL_API_KEY');
  });

  it('fails on missing values, placeholders, invalid regions, and invalid model limits', () => {
    const result = runPreflight({
      ...baseEnv,
      VITE_CLOUDBASE_ENV_ID: '<isolated-environment-id>',
      VITE_CLOUDBASE_REGION: 'ap-beijing',
      CLOUDBASE_PUBLISHABLE_KEY: undefined,
      PHOTO_MEAL_MODEL_ENDPOINT: 'http://model.example.invalid',
      PHOTO_MEAL_DAILY_LIMIT: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CloudBase manual smoke preflight failed');
    expect(result.stderr).toContain('VITE_CLOUDBASE_ENV_ID');
    expect(result.stderr).toContain('VITE_CLOUDBASE_REGION');
    expect(result.stderr).toContain('CLOUDBASE_PUBLISHABLE_KEY');
    expect(result.stderr).toContain('PHOTO_MEAL_MODEL_ENDPOINT');
    expect(result.stderr).toContain('PHOTO_MEAL_DAILY_LIMIT');
  });

  it('never prints actual secret or endpoint values', () => {
    const result = runPreflight(baseEnv);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(output).not.toContain(baseEnv.PHOTO_MEAL_MODEL_API_KEY);
    expect(output).not.toContain(baseEnv.PHOTO_MEAL_MODEL_ENDPOINT);
    expect(output).not.toContain(baseEnv.CLOUDBASE_PUBLISHABLE_KEY);
    expect(output).not.toContain(baseEnv.VITE_CLOUDBASE_PUBLISHABLE_KEY);
  });
});
