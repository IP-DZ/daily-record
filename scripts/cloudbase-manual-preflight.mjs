import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

const allowedRegions = new Set(['ap-shanghai', 'ap-guangzhou']);
const requiredVariables = [
  'VITE_CLOUDBASE_ENV_ID',
  'VITE_CLOUDBASE_PUBLISHABLE_KEY',
  'CLOUDBASE_ENV_ID',
  'CLOUDBASE_PUBLISHABLE_KEY',
  'PHOTO_MEAL_MODEL_PROVIDER',
  'PHOTO_MEAL_MODEL_ENDPOINT',
  'PHOTO_MEAL_MODEL_NAME',
  'PHOTO_MEAL_MODEL_API_KEY',
];
const placeholderMarkers = [
  /^<.*>$/,
  /isolated-environment-id/i,
  /publishable-key/i,
  /server-side-secret/i,
  /server-side-vision-model-endpoint/i,
  /vision-model-name/i,
  /model\.example/i,
  /example\.invalid/i,
];

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isPlaceholder(value) {
  if (isBlank(value)) return false;
  return placeholderMarkers.some((marker) => marker.test(value.trim()));
}

function addIssue(issues, variable, reason) {
  issues.push({ variable, reason });
}

function validateRequiredVariables(env, issues) {
  for (const variable of requiredVariables) {
    const value = env[variable];
    if (isBlank(value)) {
      addIssue(issues, variable, 'missing');
    } else if (isPlaceholder(value)) {
      addIssue(issues, variable, 'placeholder');
    }
  }
}

function validateRegions(env, issues) {
  for (const variable of ['VITE_CLOUDBASE_REGION', 'CLOUDBASE_REGION']) {
    const value = env[variable] ?? 'ap-shanghai';
    if (!allowedRegions.has(value)) {
      addIssue(issues, variable, 'invalid-region');
    }
  }
}

function validateModelConfig(env, issues) {
  if (env.PHOTO_MEAL_MODEL_PROVIDER !== 'http-json') {
    addIssue(issues, 'PHOTO_MEAL_MODEL_PROVIDER', 'unsupported-provider');
  }
  try {
    const endpoint = new URL(env.PHOTO_MEAL_MODEL_ENDPOINT ?? '');
    if (endpoint.protocol !== 'https:') {
      addIssue(issues, 'PHOTO_MEAL_MODEL_ENDPOINT', 'https-required');
    }
  } catch {
    addIssue(issues, 'PHOTO_MEAL_MODEL_ENDPOINT', 'invalid-url');
  }
  if (env.PHOTO_MEAL_DAILY_LIMIT != null && env.PHOTO_MEAL_DAILY_LIMIT.trim() !== '') {
    const dailyLimit = Number(env.PHOTO_MEAL_DAILY_LIMIT);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
      addIssue(issues, 'PHOTO_MEAL_DAILY_LIMIT', 'invalid-range');
    }
  }
}

function validateSecretBoundaries(env, issues) {
  for (const variable of Object.keys(env)) {
    if (!variable.startsWith('VITE_')) continue;
    if (/SECRET|TOKEN|APIKEY|API_KEY|OTP|TENCENTCLOUD/i.test(variable)) {
      addIssue(issues, variable, 'server-secret-prefixed-as-public');
    }
  }
}

function printPassed(variable) {
  console.log(`ok ${variable}`);
}

function printIssue(issue) {
  console.error(`fail ${issue.variable}: ${issue.reason}`);
}

const issues = [];
validateRequiredVariables(process.env, issues);
validateRegions(process.env, issues);
validateModelConfig(process.env, issues);
validateSecretBoundaries(process.env, issues);

if (issues.length > 0) {
  console.error('CloudBase manual smoke preflight failed');
  for (const issue of issues) {
    printIssue(issue);
  }
  process.exitCode = 1;
} else {
  console.log('CloudBase manual smoke preflight passed');
  for (const variable of [
    ...requiredVariables,
    'VITE_CLOUDBASE_REGION',
    'CLOUDBASE_REGION',
    'PHOTO_MEAL_DAILY_LIMIT',
  ]) {
    printPassed(variable);
  }
}
