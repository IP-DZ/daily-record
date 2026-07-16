# 评审报告：`2026-07-13-cloudbase-auth-isolation`

## 元数据

| 字段 | 值 |
|---|---|
| Reviewer | anvil-lead + 独立整分支 reviewer |
| MR / Commit | `feature/cloudbase-auth`，提交前写集 |
| Author | anvil-doer agents |
| Review Date | 2026-07-14 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|---|---|---|---|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | ESLint 退出码 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` 无诊断 |
| 单元/组件/安全测试 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 17 files，237 tests |
| Focused RLS/RPC 安全套件 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/userIsolation.test.ts` | PASS | 1 file，44 tests |
| 生产构建 | `pnpm_config_verify_deps_before_run=warn pnpm build` | PASS | 入口 JS gzip 100.87 kB；CloudBase SDK 为独立动态 chunk |
| 移动端 E2E | `pnpm_config_verify_deps_before_run=warn pnpm test:e2e -- --project=mobile-chromium --reporter=line` | PASS | 2 passed，1 manual real CloudBase spec skipped |
| Diff 格式 | `git diff --check` | PASS | 无空白错误 |

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|---|---|---|---|
| 服务端密钥暴露 | 生产产物未包含 `CLOUDBASE_APIKEY`、`TENCENTCLOUD_SECRET`、`PRIVATE_KEY` 或 `SERVER_SECRET` | — | CLEAN |
| 测试平台泄漏 | 生产产物未包含 `__daily-record-test-platform`、`test-platform` 或测试平台固定 OTP | — | CLEAN |
| 用户隔离 | `authenticated` 无直接表 DML；仅授权固定 `search_path` 的 `SECURITY DEFINER` RPC | — | CLEAN |
| 跨用户写入 | RPC 使用 `auth.uid()` 作为唯一用户来源，拒绝 payload 中的 user/email/savedAt 等额外字段 | — | CLEAN |
| 非有限数值 | SQL 拒绝 PostgreSQL 可保存但 JavaScript 会解析为 `Infinity` 的原始 JSON 超大数 | — | CLEAN |
| 日志敏感数据 | 认证错误统一映射，不向 UI/日志透出邮箱、验证码或 provider token | — | CLEAN |

**安全结论：CLEAN**

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 评审回答 | 结论 | 严重级别 |
|---|---|---|---|---|
| Think Before Coding | 会话恢复、退出和跨 context 是否存在陈旧异步回写？ | Auth gate 与 repository 均有 stale guard，退出清理失败不会静默污染用户状态 | PASS | — |
| Simplicity First | 是否引入了过早的后端抽象？ | 保持 AuthPort 与 ProfileSettingsRepository 两个端口；CloudBase 与测试平台实现可替换 | PASS | — |
| Surgical Changes | 任务 2 是否越界到后续业务？ | 只接入账号、资料目标同步、RLS/RPC、测试平台和必要 onboarding 集成 | PASS | — |
| Goal-Driven Execution | 测试是否证明真实隔离行为？ | PGlite 套件验证 guest/auth/service_role 权限、A/B 隔离、payload 严格校验与无部分写入 | PASS | — |

**Karpathy Score：4/4**

## 4. 对抗式维度评审

### 4.1 认证与会话

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/features/auth/AuthGate.tsx:1` | 会话恢复期间是否会渲染错误用户数据？ | 恢复完成前显示认证状态；异步结果带 generation guard | PASS | — |
| `src/platform/cloudbase/CloudBaseAuthAdapter.ts:1` | provider 错误是否泄漏验证码或邮箱？ | 错误映射为固定业务码和用户可读消息 | PASS | — |

### 4.2 数据隔离与 RPC

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `cloud/database/migrations/0001_profiles_and_nutrition_goals.sql:1` | `authenticated` 能否绕过 RPC 直接 DML？ | 表权限全部 revoke；authenticated 仅可 EXECUTE 两个 RPC | PASS | — |
| `cloud/database/migrations/0001_profiles_and_nutrition_goals.sql:153` | SQL 合约是否弱于前端 zod `finite()`？ | 六个 target 同时要求非负且不超过 `Number.MAX_VALUE` | PASS | — |
| `tests/security/userIsolation.test.ts:221` | 超大 JSON 数值是否通过生产 RPC 真实复现？ | 测试用 `$2::jsonb` 原始 `1e309` 逐字段写入 production RPC，并验证无部分写入 | PASS | — |

### 4.3 本地草稿与跨用户边界

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/platform/settings/browserDraftSettingsRepository.ts:1` | guest 与登录用户是否共享 localStorage key？ | key 按 scope/userId 分离，避免未登录草稿污染登录用户 | PASS | — |
| `src/features/onboarding/OnboardingPage.tsx:1` | 云端保存失败是否破坏本地可恢复性？ | 先本地、后远端；远端错误通过状态呈现，不丢失本地草稿 | PASS | — |

### 4.4 E2E 与真实环境 blocker

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `tests/e2e/auth-onboarding.spec.ts:83` | 自动 E2E 是否覆盖 A/B 隔离与跨 context 加载？ | 内存平台覆盖 OTP、会话恢复、A/B 切换、跨 BrowserContext 目标加载与退出 | PASS | — |
| `tests/e2e/cloudbase-auth.manual.spec.ts:37` | 是否伪报真实 CloudBase smoke？ | manual spec 默认跳过；计划明确环境 owner 与 next step | PASS | — |

## 5. 已解决发现项摘要

### Critical（阻塞提交）

无。

### Important（终审复审后已解决）

| 项 | 原问题 | 修复证据 |
|---|---|---|
| SQL 数值合约 | PostgreSQL 可保存原始 JSON `1e100000`，JavaScript 加载后变为 `Infinity`，弱于 zod `.finite()` | 六个 target 增加 `Number.MAX_VALUE` 上限；测试验证 `Number.MAX_VALUE` 可接受、原始 `1e309` 逐字段拒绝且无部分写入 |
| 计划证据过期 | 主计划仍记录旧 EPERM E2E blocker | 主计划更新为 2026-07-14 `mobile-chromium` 2 passed / 1 manual skipped，并保留真实 CloudBase blocker |

### Low / Nit（可选）

无。

## 6. 门禁结论

| 门禁项 | 状态 |
|---|---|
| 所有自动化检查通过 | [x] |
| 安全扫描干净 | [x] |
| Karpathy score = 4/4 | [x] |
| 无未解决 Critical 问题 | [x] |
| 无未解决 Important 问题 | [x] |
| 评审文档完整 | [x] |

### 结论

- [ ] **BLOCK** — 提交前必须解决发现项
- [x] **APPROVE** — 所有门禁通过，任务 2 可以创建保护性提交

### 评审备注

真实 CloudBase 邮箱 OTP、双会话并发和跨设备 smoke 尚未执行；原因是仓库尚未配置隔离 CloudBase 环境与两个测试邮箱。该项不阻塞本地合约、RLS/RPC、认证 UI 与同步链路提交，但必须按 `docs/operations/cloudbase-test-environment.md` 配置后再声明真实环境通过。
