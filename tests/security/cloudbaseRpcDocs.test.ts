// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = resolve(repoRoot, 'scripts/validate-cloudbase-rpc-docs.mjs');

describe('CloudBase RPC deployment documentation', () => {
  it('keeps every migration-defined RPC listed in the isolated environment smoke checklist', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CloudBase RPC documentation validation passed');
  });
});
