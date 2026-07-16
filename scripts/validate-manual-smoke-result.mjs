import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';

const requiredSections = [
  '执行环境',
  'Preflight',
  'Manual Spec',
  '业务 Smoke',
  '中国大陆网络 Smoke',
  '结果',
  '阻塞项',
];

const sensitivePatterns = [
  {
    issue: 'email',
    pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
  },
  {
    issue: 'otp-code',
    pattern: /(?:验证码|OTP|code)\s*[：:]\s*\d{4,8}/i,
  },
  {
    issue: 'session-token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/,
  },
  {
    issue: 'cloud-object-path',
    pattern: /(?:cloud:\/\/|users\/[^/\s]+\/(?:photo-meal|meals)\/[^)\]\s]+)/i,
  },
  {
    issue: 'signed-url',
    pattern: /\?(?:[^ \n\r]*)(?:X-Amz-Signature|Signature|sign|token)=/i,
  },
  {
    issue: 'secret-like-value',
    pattern: /(?:sk-[A-Za-z0-9][A-Za-z0-9_-]{7,}|(?:SECRET|API_KEY|TOKEN)\s*=\s*[^\s]+)/i,
  },
];

function addIssue(issues, issue, detail) {
  issues.push({ issue, detail });
}

function validateSections(content, issues) {
  for (const section of requiredSections) {
    if (!content.includes(`## ${section}`)) {
      addIssue(issues, 'missing-section', section);
    }
  }
}

function validateSensitiveMarkers(content, issues) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { issue, pattern } of sensitivePatterns) {
      if (pattern.test(line)) {
        addIssue(issues, issue, `line ${index + 1}`);
      }
    }
  });
}

function printIssue({ issue, detail }) {
  console.error(`fail ${issue}: ${detail}`);
}

const resultPath = process.argv[2];
if (!resultPath) {
  console.error('Usage: node scripts/validate-manual-smoke-result.mjs <manual-smoke-result.md>');
  process.exit(1);
}

if (!existsSync(resultPath)) {
  console.error(`Manual smoke result file not found: ${basename(resultPath)}`);
  process.exit(1);
}

const content = readFileSync(resultPath, 'utf8');
const issues = [];

validateSections(content, issues);
validateSensitiveMarkers(content, issues);

if (issues.length > 0) {
  console.error('Manual smoke result validation failed');
  for (const issue of issues) {
    printIssue(issue);
  }
  process.exit(1);
}

console.log('Manual smoke result validation passed');
