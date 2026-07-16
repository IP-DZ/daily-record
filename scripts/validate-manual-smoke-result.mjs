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

const requiredChecks = [
  '`pnpm preflight:cloudbase-manual`',
  '`VITE_CLOUDBASE_*` 公开变量完整性',
  '`CLOUDBASE_*` 云函数变量完整性',
  '`PHOTO_MEAL_*` 模型变量完整性',
  'CloudBase 地域合法',
  '模型 endpoint 为 HTTPS',
  'A 设备 1 邮箱 OTP 登录',
  'B 设备邮箱 OTP 登录',
  'A 设备 2 邮箱 OTP 登录',
  'A/B 本地 session 隔离',
  'A/B 目标与资料跨账号隔离',
  'A 跨设备资料同步',
  '退出后刷新仍为登录页',
  'Playwright trace、screenshot、video 和 storageState 未保存敏感数据',
  'A 保存目标、手动餐食、体重、训练',
  'B 不可读取 A 的业务数据',
  'A 触发 `mealPhotoAnalysis` 并返回可编辑估算',
  '图片分析失败时只显示稳定错误',
  '确认图片估算后今日汇总变化，确认前不变化',
  'B 不可读取 A 的 `ai_analyses` 或 `meals`',
  '每日限流按当前账号与日期生效',
  '清空 A 应用数据后 A 业务数据不可读且 B 不受影响',
  '`/` 与 `/onboarding` 首屏可访问',
  '`/today`、`/photo-meal`、`/trends`、`/settings` 可访问',
  'PWA 安装提示 / 更新提示',
  '离线刷新只展示静态应用外壳或离线提示',
  '私有图片、签名 URL 和账号 API 响应未被 service worker 缓存',
  'LCP 小于目标预算或已记录原因',
  '包体预算小于目标或已记录原因',
];

const statusPattern = '[：:]\\s*(?:pass|fail|blocked)\\b';

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
  {
    issue: 'public-ip',
    pattern: /\b(?!(?:10|127)\.)(?!(?:172\.(?:1[6-9]|2\d|3[0-1]))\.)(?!(?:192\.168)\.)(?:\d{1,3}\.){3}\d{1,3}\b/,
  },
  {
    issue: 'cloudbase-env-id',
    pattern: /(?:CloudBase\s*环境\s*(?:ID)?|环境\s*ID)\s*[：:]\s*[A-Za-z0-9][A-Za-z0-9_-]{5,}/i,
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

function validateRequiredChecks(content, issues) {
  for (const check of requiredChecks) {
    if (!content.includes(check)) {
      addIssue(issues, 'missing-check', check);
      continue;
    }
    const escapedCheck = check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const checkStatusPattern = new RegExp(`${escapedCheck}${statusPattern}`, 'i');
    if (!checkStatusPattern.test(content)) {
      addIssue(issues, 'missing-check-status', check);
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
validateRequiredChecks(content, issues);
validateSensitiveMarkers(content, issues);

if (issues.length > 0) {
  console.error('Manual smoke result validation failed');
  for (const issue of issues) {
    printIssue(issue);
  }
  process.exit(1);
}

console.log('Manual smoke result validation passed');
