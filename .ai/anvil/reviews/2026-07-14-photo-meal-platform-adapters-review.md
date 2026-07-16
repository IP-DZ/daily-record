# 评审报告：2026-07-14-photo-meal-platform-adapters

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地未提交 Task 3 diff |
| Author | Codex |
| Review Date | 2026-07-14 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | `eslint .` exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` exit 0 |
| 单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/cloudbase/createCloudBasePlatform.test.ts src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.test.ts` | PASS | 3 个测试文件、15 条测试通过 |
| Diff whitespace | `git diff --check` | PASS | 无 whitespace error |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| 当前 plan 的“历史经验约束” | 页面依赖平台端口，CloudBase adapter 不泄露 provider 原始错误，test platform 不从客户端命令接收 `userId` | PASS：新增端口隔离 CloudBase；adapter 统一错误；test platform 从 `current-user` 取用户 |
| `docs/solutions` | 无可读取历史知识库 | N/A |

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 未新增密钥、token、模型配置或 `VITE_` 模型变量 | — | PASS |
| 注入风险 | 未新增 SQL/NoSQL 拼接；CloudBase payload 经过 schema 校验 | — | PASS |
| XSS 风险 | 未新增 UI/HTML 渲染点 | — | PASS |
| 依赖 CVE | 未新增依赖 | — | PASS |
| 日志敏感数据 | 未新增日志；错误不包含 provider detail、URL 或图片内容 | — | PASS |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? | 假设 CloudBase 图片分析只通过云函数入口，客户端不传用户身份；plan 和测试均覆盖。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | 端口、一个 CloudBase adapter、一个 test platform 实现是后续 UI 所需的最小三件套。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? | 所有变更落在 Task 3 Ownership；`createCloudBasePlatform.test.ts` 是装配覆盖补强。 | PASS | — |
| Goal-Driven Execution | Do the tests prove behavior? | 测试验证 callFunction shape、错误脱敏、用户隔离、requestId 幂等、确认入账和丢弃状态。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/photoMeal/PhotoMealAnalysisRepository.ts:8` | 新端口是否必要？ | UI 后续只依赖 `PhotoMealAnalysisRepository`，不需要知道 CloudBase 或 test platform。 | PASS | — |
| `src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.ts:22` | 为什么 CloudBase adapter 用 `callFunction` 而不是 RDB？ | 图片分析需要服务端保存私有图、调用模型和确认事务；浏览器不能直连模型或存储管理接口。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.ts:52` | CloudBase 调用是否携带 `userId`、邮箱或密钥？ | payload 只来自 create/confirm schema 或 `{ analysisId }`；测试用 JSON 断言拒绝身份/密钥字段。 | PASS | — |
| `src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.ts:60` | provider 错误和非法响应会不会泄露给用户？ | public methods 全部 catch 并抛 `PhotoMealAnalysisRepositoryError`。 | PASS | — |
| `src/platform/testing/createTestPlatform.ts:394` | test platform 是否隔离 A/B 用户？ | 每用户独立 `photoMealAnalysesByUserId`，用户来自 `current-user`。 | PASS | — |
| `src/platform/testing/createTestPlatform.ts:427` | confirm 前后餐食汇总是否符合需求？ | create 只保存分析；confirm 才调用 `createStoredMealForUser` 写正式 `meals`。 | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入：create/confirm 使用 schema；空 analysis id 由 `requireAnalysisId` 拦截。
- [x] 边界值 / 最大尺寸：照片对象沿用 `PreparedMealPhoto` schema。
- [x] 负数 / 非法值：候选和营养沿用 Task 1 schema。
- [x] 竞态 / 死锁：Task 3 无共享异步锁；生产并发交给 Task 4 RPC 事务覆盖。
- [x] 外部依赖失败：CloudBase resolve error、reject、非法响应均映射稳定错误。
- [x] 并发访问：test platform requestId 幂等；生产幂等由 Task 4 DB 唯一键覆盖。

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.ts:48` | 私有 `call` 是否隐藏太多？ | 只统一固定函数名、action/payload 形状和 provider error 检查，减少四个方法重复。 | PASS | — |
| `src/platform/testing/createTestPlatform.ts:150` | 提取 `createStoredMealForUser` 是否值得？ | 手动 meals.create 和 photo confirm 共用正式餐食写入路径，避免确认逻辑绕开既有 schema。 | PASS | — |

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/photoMeal/PhotoMealAnalysisRepository.ts:15` | `PhotoMealAnalysisRepositoryError` 是否表达稳定错误？ | 与 `MealsRepositoryError` 模式一致，隐藏 provider 细节。 | PASS | — |
| `src/platform/testing/createTestPlatform.ts:138` | `userPhotoMealAnalyses` 是否明确按用户隔离？ | 名称明确返回当前用户分析集合。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| — | 是否有 TODO 或注释掩盖复杂度？ | 无新增注释/TODO；行为由 schema、类型和测试表达。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| `src/platform/cloudbase/index.ts:1` | barrel export 与现有 CloudBase repository 风格一致 | — | PASS |
| `src/platform/cloudbase/createCloudBasePlatform.ts:66` | `photoMeals` 使用非枚举 property，延续 meals/weight/workouts 的 raw SDK 隐藏方式 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/testing/createTestPlatform.ts:468` | 返回 platform 新成员是否会破坏 App 当前类型？ | 结构类型允许额外字段；Task 5 再把 UI 依赖接入。现有 App 测试和 typecheck 通过。 | PASS | — |
| `src/platform/cloudbase/createCloudBasePlatform.ts:66` | 是否暴露 raw SDK/RDB？ | `Object.keys(platform)` 仍只有 `auth/profileSettings`，测试覆盖 `photoMeals` 存在但不暴露 raw client。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/cloudbase/CloudBasePhotoMealAnalysisRepository.test.ts:56` | CloudBase 测试是否验证精确调用形状？ | 逐个断言 create/get/confirm/discard 的 `name/action/payload`。 | PASS | — |
| `src/platform/testing/createTestPlatform.test.ts:309` | test platform 测试是否验证关键用户行为？ | 覆盖 A/B 隔离、requestId 幂等、confirm 前汇总不变、confirm 后正式餐食可见。 | PASS | — |

**维度结论：** PASS

---

## 5. 发现项摘要

### Critical（阻塞提交）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| — | — | — | 无 | — |

### High（阻塞提交）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| — | — | — | 无 | — |

### Medium（强烈建议修复）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| — | — | — | 无 | — |

### Low / Nit（可选）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| — | — | — | 无 | — |

---

## 6. 门禁结论

| 门禁项 | 状态 |
|--------|------|
| 所有自动化检查通过 | [x] |
| 安全扫描干净 | [x] |
| Karpathy score = 4/4 | [x] |
| 无未解决 Critical 问题 | [x] |
| 无未解决 High 问题 | [x] |
| 评审文档完整 | [x] |
| Source-of-truth 状态、验证证据和 resume point 已写回 plan | [x] |
| 未创建第二任务状态系统 | [x] |

### 结论

- [ ] **BLOCK** — 提交前必须解决发现项
- [x] **APPROVE** — 所有门禁通过，建议执行 `/anvil:compound`

### 评审备注

Task 3 可以提交并推送；后续继续 Task 4。生产级事务、RLS、requestId 唯一性和真实模型失败重试仍属于 Task 4，不在本平台端口提交中伪报完成。
