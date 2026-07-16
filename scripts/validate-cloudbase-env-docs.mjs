import console from 'node:console';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const preflightPath = resolve(repoRoot, 'scripts/cloudbase-manual-preflight.mjs');
const docsToCheck = [
  'docs/operations/deployment.md',
  'docs/operations/cloudbase-test-environment.md',
];

function collectPreflightVariables() {
  const preflight = readFileSync(preflightPath, 'utf8');
  const variables = [...preflight.matchAll(/'([A-Z][A-Z0-9_]+)'/g)]
    .map((match) => match[1])
    .filter((variable) => (
      variable.startsWith('VITE_CLOUDBASE_')
      || variable.startsWith('CLOUDBASE_')
      || variable.startsWith('PHOTO_MEAL_')
    ))
    .filter((variable) => variable !== 'CLOUDBASE_APIKEY')
    .sort();

  return [...new Set(variables)];
}

function addIssue(issues, documentPath, variable) {
  issues.push({ documentPath, variable });
}

const variables = collectPreflightVariables();
const issues = [];

for (const documentPath of docsToCheck) {
  const content = readFileSync(resolve(repoRoot, documentPath), 'utf8');
  for (const variable of variables) {
    if (!content.includes(variable)) {
      addIssue(issues, documentPath, variable);
    }
  }
}

if (issues.length > 0) {
  console.error('CloudBase environment documentation validation failed');
  for (const issue of issues) {
    console.error(`fail missing-env-doc: ${issue.documentPath} ${issue.variable}`);
  }
  process.exit(1);
}

console.log('CloudBase environment documentation validation passed');
for (const variable of variables) {
  console.log(`ok ${variable}`);
}
