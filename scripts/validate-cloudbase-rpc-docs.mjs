import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const migrationsRoot = resolve(repoRoot, 'cloud/database/migrations');
const environmentDocPath = resolve(repoRoot, 'docs/operations/cloudbase-test-environment.md');

function collectMigrationRpcNames() {
  return readdirSync(migrationsRoot)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .flatMap((entry) => {
      const content = readFileSync(resolve(migrationsRoot, entry), 'utf8');
      return [...content.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)/gi)]
        .map((match) => match[1]);
    });
}

const rpcNames = [...new Set(collectMigrationRpcNames())].sort();
const environmentDoc = readFileSync(environmentDocPath, 'utf8');
const missing = rpcNames.filter((rpcName) => !environmentDoc.includes(rpcName));

if (missing.length > 0) {
  console.error('CloudBase RPC documentation validation failed');
  for (const rpcName of missing) {
    console.error(`fail missing-rpc: ${rpcName}`);
  }
  process.exit(1);
}

console.log('CloudBase RPC documentation validation passed');
for (const rpcName of rpcNames) {
  console.log(`ok ${rpcName}`);
}
