// @vitest-environment node

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = resolve(repoRoot, 'scripts/validate-manual-smoke-result.mjs');

function writeSmokeResult(content: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), 'daily-record-smoke-'));
  const filePath = resolve(directory, 'manual-smoke-result.md');
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function runValidator(content: string) {
  return spawnSync(process.execPath, [scriptPath, writeSmokeResult(content)], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
    },
    encoding: 'utf8',
  });
}

const sanitizedSmokeResult = `# 真实 CloudBase Smoke 脱敏结果模板

## 执行环境

- 日期：2026-07-16
- 执行人：owner
- Git commit：0de3208f
- 部署版本：v0.1.0-smoke
- CloudBase 环境：隔离测试环境
- 网络：大陆 5G
- 设备与浏览器：iPhone Safari
- 测试账号：A/B 脱敏代号
- 测试图片策略：专用测试图片

## Preflight

- \`pnpm preflight:cloudbase-manual\`：pass
- 备注：变量完整，未记录具体值。

## Manual Spec

- A 设备 1 邮箱 OTP 登录：pass
- B 设备邮箱 OTP 登录：pass
- A 设备 2 邮箱 OTP 登录：pass
- 备注：只记录 A/B 代号。

## 业务 Smoke

- A 保存目标、手动餐食、体重、训练：pass
- A 触发 \`mealPhotoAnalysis\` 并返回可编辑估算：pass
- 备注：模型返回已通过 schema 校验。

## 中国大陆网络 Smoke

- \`/\` 与 \`/onboarding\` 首屏可访问：pass
- LCP 小于目标预算或已记录原因：pass
- 备注：耗时区间 2-3s。

## 结果

- 总结：pass
- 是否可发布：yes
- 必须修复项：无
- 可延期项：无
- 下一步：发布前复核。

## 阻塞项

| 项 | owner | next | 脱敏说明 |
| --- | --- | --- | --- |
| 无 | owner | 无 | 无 |
`;

describe('manual smoke result validator', () => {
  it('passes a redacted manual smoke result with all required sections', () => {
    const result = runValidator(sanitizedSmokeResult);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Manual smoke result validation passed');
  });

  it('fails on sensitive markers without echoing their values', () => {
    const leakedValues = [
      'real-user@example.com',
      '246810',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhIn0.signaturePart',
      'cloud://env-id/users/raw-user-id/photo-meal/request-id/photo.webp',
      'https://storage.example.invalid/photo.webp?Signature=super-secret-signature',
      'sk-should-not-be-committed',
    ];
    const result = runValidator(`${sanitizedSmokeResult}

补充泄露样例：
- 邮箱：${leakedValues[0]}
- 验证码：${leakedValues[1]}
- session：${leakedValues[2]}
- 对象路径：${leakedValues[3]}
- 签名 URL：${leakedValues[4]}
- 模型 secret：${leakedValues[5]}
`);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    for (const issue of [
      'email',
      'otp-code',
      'session-token',
      'cloud-object-path',
      'signed-url',
      'secret-like-value',
    ]) {
      expect(result.stderr).toContain(issue);
    }
    for (const leakedValue of leakedValues) {
      expect(output).not.toContain(leakedValue);
    }
  });

  it('fails when required manual smoke sections are missing', () => {
    const result = runValidator(`## 执行环境

- 日期：2026-07-16
`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing-section');
    expect(result.stderr).toContain('Preflight');
    expect(result.stderr).toContain('结果');
  });
});
