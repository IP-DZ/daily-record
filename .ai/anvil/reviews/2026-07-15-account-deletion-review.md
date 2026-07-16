# 隐私设置与清空应用数据审阅

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地 Task 2 diff，目标提交 `feat: add account data deletion` |
| Author | Codex |
| Review Date | 2026-07-15 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | exit 0 |
| 聚焦单元/安全测试 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/accountDeletionIsolation.test.ts tests/security/migrationShape.test.ts src/platform/cloudbase/CloudBaseAccountRepository.test.ts src/platform/testing/createTestPlatform.test.ts src/features/settings/SettingsPage.test.tsx src/app/App.test.tsx` | PASS | 6 files / 45 tests |
| 全量单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 47 files / 428 tests |
| Diff whitespace | `git diff --check` | PASS | exit 0 |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| `.ai/anvil/reviews/2026-07-13-cloudbase-auth-isolation-review.md` | Definer RPC 必须 fixed `search_path`、仅由 `auth.uid()` 决定用户身份、错误不泄露验证码/邮箱/token | PASS：`delete_my_application_data()` fixed search_path，不接受 user 参数；UI/adapter 统一安全错误 |
| `.ai/anvil/reviews/2026-07-14-photo-meal-security-handler-review.md` | 跨用户操作和部分写入必须由生产迁移安全测试证明 | PASS：PGlite 测试覆盖 A/B 用户隔离、未认证拒绝、无 user_id 参数 |
| `.ai/anvil/reviews/2026-07-15-offline-drafts-review.md` | Anvil 计划必须保持单一 source-of-truth，进度和证据回写计划 | PASS：Task 2 write set、verification、evidence 与 resume point 已写回 `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` |

**使用规则：** 历史 learning 只作为 review lenses；以下结论均基于当前 diff、测试和验证命令。

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | `rg` 未发现新增 cloud/AI secret、token、password、API key；测试邮箱仅 `.example.test`/本地测试 | — | CLEAN |
| 注入风险 | SQL RPC 无动态 SQL；所有删除条件来自 `auth.uid()`；前端不传 userId | — | CLEAN |
| XSS 风险 | Settings UI 仅渲染固定中文文案和本地状态，不渲染 provider error/detail | — | CLEAN |
| 依赖 CVE | 未新增依赖 | — | CLEAN |
| 日志敏感数据 | 未新增生产日志；错误文案脱敏 | — | CLEAN |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? Are any of them wrong? | 假设“清空应用数据”不等于删除登录身份；页面明示该语义，SQL 只删除业务表，计划记录真实 CloudBase/storage smoke blocker。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? What would happen if I inlined every abstraction? | 新增 `AccountRepository` 是现有平台端口模式的一致延伸；只有一个方法，没有投机配置或多 provider 分支。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? Is there any line whose purpose I cannot explain after reading it three times? | 改动集中在删除 RPC、CloudBase adapter、test platform、settings route/UI 和对应测试/计划证据。 | PASS | — |
| Goal-Driven Execution | If I delete the tests, do I still know what this code is supposed to do? Do the tests prove the feature works, or do they just prove the code runs? | 测试覆盖 DB 隔离、无 user 参数、未认证拒绝、adapter 调用 shape、设置页确认短语、App 路由和 test platform profile 清理。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/account/AccountRepository.ts:1` | 是否需要单独 account 端口，还是能塞进 auth/profile repo？ | 删除应用数据是账号级危险操作，但不删除身份；独立端口避免污染 auth 和 profile settings。 | PASS | — |
| `src/app/App.tsx:438` | `/settings` 是否应经过鉴权，而不是公开路由？ | 使用 `AuthGate` 包裹，缺少平台时显示配置提示。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/database/migrations/0006_account_deletion.sql:1` | 删除是否会跨用户或接受伪造 userId？ | 函数零参数，仅使用 `auth.uid()`；测试断言传 user_id 参数失败。 | PASS | — |
| `cloud/database/migrations/0006_account_deletion.sql:14` | 是否覆盖所有当前用户业务数据？ | 删除 `ai_analyses`、`meals`、`weight_entries`、`workouts`、`profiles`；`profiles` 级联 `nutrition_goals`，`workouts` 级联 exercises/sets。 | PASS | — |
| `src/platform/testing/createTestPlatform.ts:521` | 测试平台是否与生产一样清 profile？ | Review 中先加严测试得到 RED，再新增 `delete-application-data` 测试操作同步清当前用户 profile。 | PASS | — |
| `src/features/settings/SettingsPage.tsx:18` | 用户误触如何避免？ | exact confirmation phrase 和 disabled button 双层保护；进行中不重复提交。 | PASS | — |
| `src/platform/cloudbase/CloudBaseAccountRepository.ts:24` | Provider 失败是否泄露私密错误？ | catch 后统一抛 `AccountRepositoryError`。 | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入：删除 RPC 零参数；UI phrase 不匹配直接 return
- [x] 边界值 / 最大尺寸：不处理用户输入数值
- [x] 负数 / 非法值：不适用
- [x] 竞态 / 死锁：重复点击由 `isDeleting` 阻断；SQL 单事务函数执行
- [x] 外部依赖失败：adapter/UI 错误脱敏，测试覆盖失败提示
- [x] 并发访问：DB 删除基于当前 session user，跨用户测试覆盖

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/cloudbase/CloudBaseAccountRepository.ts:9` | zod schema 是否过度？ | 与其他 CloudBase adapter 保持严格响应校验，避免 provider 返回异常结构被 UI 当成功。 | PASS | — |
| `src/features/settings/SettingsPage.tsx:12` | 是否需要独立页面而非塞进首页？ | 这是危险隐私操作，独立设置页更清晰；代码无额外 hook/上下文。 | PASS | — |

**过度设计检查：**
- [x] 无投机抽象
- [x] 无未使用泛型/hooks
- [x] 无不必要间接层
- [x] 核心需求保持一个端口、一个 adapter、一个页面

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `deleteMyApplicationData` | 名字是否让人误以为删除登录账号？ | “ApplicationData” 明确限定业务数据；UI 同步说明不删除登录身份。 | PASS | — |
| `delete_my_application_data` | SQL 名称是否表达当前用户边界？ | 函数名少了 `my`，但零参数 + grant to authenticated + 测试覆盖；迁移命名与 UI/端口统一。 | PASS | — |

**命名问题：**
- [x] 无模糊命名
- [x] 函数名表达副作用
- [x] 无未解释缩写
- [x] 主要行为可由名称预测

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/testing/createTestPlatform.ts:489` | 注释是否在解释复杂度而非必要背景？ | 这是既有 legacy 测试兼容说明；本变更未新增不可执行 TODO。 | PASS | — |

**注释质量检查：**
- [x] 无新增不可执行 TODO
- [x] 无用注释掩盖复杂度
- [x] 无易失真说明

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| — | 未发现风格阻断问题 | — | PASS |

**风格检查：**
- [x] 遵循现有 repository/adapter/page 测试风格
- [x] 风格改动未混入无关功能改动
- [x] `eslint .` 通过

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md:13` | 是否留下清楚 resume point？ | Resume point 指向 Task 3，真实 CloudBase/模型/大陆网络 smoke blocker 未伪报。 | PASS | — |
| `.ai/anvil/reviews/2026-07-15-account-deletion-review.md` | 是否创建了第二状态系统？ | 仅新增 Anvil review artifact，进度仍回写 active plan。 | PASS | — |

**系统健康检查：**
- [x] 看过主要完整文件和关键 diff
- [x] 没有新增不必要耦合
- [x] 后续 Task 3 可通过统一平台端口继续
- [x] 无死代码/过期文档

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/security/accountDeletionIsolation.test.ts:151` | DB 测试是否证明跨用户隔离？ | A/B 各建资料、餐食、体重、训练、拍照分析；删除 A 后 counts 只少一组，B 分析仍可读。 | PASS | — |
| `tests/security/accountDeletionIsolation.test.ts:193` | 是否证明不能传 userId？ | `delete_my_application_data('user-b')` 拒绝，未认证 session 拒绝。 | PASS | — |
| `src/platform/testing/createTestPlatform.test.ts:427` | Test platform 是否覆盖 profile 删除？ | Review RED/GREEN 证明清空后 A profile 为 null，B profile 仍存在。 | PASS | — |
| `src/features/settings/SettingsPage.test.tsx:10` | UI 测试是否只测渲染？ | 覆盖 phrase 不匹配禁用、匹配后调用、成功文案和失败脱敏。 | PASS | — |

**测试质量检查：**
- [x] 故意破坏测试平台 profile 清理时测试会失败，已记录 REVIEW RED
- [x] 测试验证行为而非实现细节
- [x] 关键安全边界均有覆盖
- [x] 断言可读
- [x] Mock 没有绕过生产 adapter/RPC 关键调用形状

**维度结论：** PASS

---

## 5. 发现项摘要

### Critical（阻塞提交）

无。

### High（阻塞提交）

无。

### Medium（强烈建议修复）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| M1 | 4.2 功能 | `src/platform/testing/createTestPlatform.ts:521` | 初始 diff 只清测试平台客户端业务 maps，未同步清测试路由中的 profile 数据；这会让 test platform 与生产 RPC 语义不一致。 | 已修复：加严测试得到 RED，新增 `delete-application-data` 测试操作，清当前用户 profile 且不影响 B 用户。 |

### Low / Nit（可选）

无。

---

## 6. 门禁结论

| 门禁项 | 状态 |
|--------|------|
| 所有自动化检查通过 | [x] |
| 安全扫描干净 | [x] |
| Karpathy score = 4/4 | [x] |
| 无未解决 Critical 问题 | [x] |
| 无未解决 High 问题 | [x] |
| Source-of-truth 状态、验证证据和 resume point 已写回 plan | [x] |
| 可提交 | [x] |

## 结论

Task 2「隐私设置与清空应用数据」可以提交。真实 CloudBase 环境执行、私有对象存储清理策略和大陆网络 smoke 仍保留在 Task 4/final validation blocker 中，不在本地单测中伪报通过。
