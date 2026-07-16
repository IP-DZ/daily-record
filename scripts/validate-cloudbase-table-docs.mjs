import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const migrationsRoot = resolve(repoRoot, 'cloud/database/migrations');
const environmentDocPath = resolve(repoRoot, 'docs/operations/cloudbase-test-environment.md');

function collectMigrationTableNames() {
  return readdirSync(migrationsRoot)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .flatMap((entry) => {
      const content = readFileSync(resolve(migrationsRoot, entry), 'utf8');
      return [...content.matchAll(/CREATE\s+TABLE\s+public\.([a-z0-9_]+)/gi)]
        .map((match) => match[1]);
    });
}

const tableNames = [...new Set(collectMigrationTableNames())].sort();
const environmentDoc = readFileSync(environmentDocPath, 'utf8');
const missing = tableNames.filter((tableName) => !environmentDoc.includes(tableName));

if (missing.length > 0) {
  console.error('CloudBase table documentation validation failed');
  for (const tableName of missing) {
    console.error(`fail missing-table: ${tableName}`);
  }
  process.exit(1);
}

console.log('CloudBase table documentation validation passed');
for (const tableName of tableNames) {
  console.log(`ok ${tableName}`);
}
