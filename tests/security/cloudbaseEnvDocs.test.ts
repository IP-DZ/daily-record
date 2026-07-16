// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = resolve(repoRoot, 'scripts/validate-cloudbase-env-docs.mjs');

describe('CloudBase environment variable documentation', () => {
  it('keeps preflight variables documented in deployment and isolated environment guides', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CloudBase environment documentation validation passed');
  });
});
