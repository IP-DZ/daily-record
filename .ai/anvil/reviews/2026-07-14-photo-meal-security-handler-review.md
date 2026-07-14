# 评审报告：2026-07-14-photo-meal-security-handler

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地未提交 Task 4 diff |
| Author | Codex |
| Review Date | 2026-07-14 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | `eslint .` exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` exit 0 |
| 单元/安全测试 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/photoMealAnalysisIsolation.test.ts tests/security/migrationShape.test.ts cloud/functions/meal-photo-analysis/src/handler.test.ts` | PASS | 3 个测试文件、13 条测试通过 |
| Diff whitespace | `git diff --check` | PASS | 无 whitespace error |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| 当前 plan 的“历史经验约束” | `authenticated` 不应有直接表权限；RPC 不接受 `user_id`；CloudBase/模型错误要脱敏；确认前不写正式餐食 | PASS：PGlite shape/isolation 和 handler 测试均覆盖 |
| `docs/solutions` | 无可读取历史知识库 | N/A |

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 未新增模型密钥、CloudBase 密钥或 `VITE_` 模型变量 | — | PASS |
| 注入风险 | RPC 使用参数化 jsonb/uuid/text；无动态 SQL | — | PASS |
| XSS 风险 | 未新增 UI/HTML 渲染点 | — | PASS |
| 依赖 CVE | 未新增第三方依赖 | — | PASS |
| 日志敏感数据 | handler 日志只写事件、requestId、entityId、outcome/errorCode；不写照片 data URL、provider stack、密钥 | — | PASS |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? | 假设生产确认必须事务化、用户身份只来自 `auth.uid()`/event auth；plan 与 tests 均覆盖。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | SQL 长度主要来自安全校验和 JSON 输出；未引入后台队列、长轮询或多图批处理。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? | 变更集中在 Task 4 Ownership：迁移、安全测试、handler。 | PASS | — |
| Goal-Driven Execution | Do the tests prove behavior? | 测试证明隔离、权限、幂等、确认事务、失败不入账、handler 重试/限流/脱敏。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/database/migrations/0004_photo_meal_analysis.sql:1` | `ai_analyses` 表是否必要？ | AI 结果确认前不能写 `meals`；需要临时、安全、可确认/丢弃的分析记录。 | PASS | — |
| `cloud/functions/meal-photo-analysis/src/handler.ts:68` | handler 是否应做依赖注入？ | 便于测试 storage/model/database/clock/logger，不把生产 SDK 或密钥写入浏览器/测试。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/database/migrations/0004_photo_meal_analysis.sql:31` | 重复 requestId 是否幂等？ | `(user_id, request_id)` 唯一索引；create RPC 返回既有记录。 | PASS | — |
| `cloud/database/migrations/0004_photo_meal_analysis.sql:37` | 用户是否可直接读写 `ai_analyses`？ | RLS enabled，且直接表权限从 `authenticated` 撤销；测试覆盖 permission denied。 | PASS | — |
| `cloud/database/migrations/0004_photo_meal_analysis.sql:116` | DB 是否会接受非法候选项？ | 审阅补了 RED，现已深度校验 candidate confidence、nutrition、questions、额外 key。 | PASS | — |
| `cloud/database/migrations/0004_photo_meal_analysis.sql:255` | 确认失败是否会产生部分 meal？ | confirm RPC 在单个 definer function 内执行；非法/跨用户/重复确认测试验证 meal count 不变。 | PASS | — |
| `cloud/functions/meal-photo-analysis/src/handler.ts:122` | 模型坏 JSON 或 provider 失败是否泄露？ | 只记 `model_retry/model_failed` 稳定 errorCode；第二次失败写 failed 分析，不返回 provider stack。 | PASS | — |

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/database/migrations/0004_photo_meal_analysis.sql:78` | SQL payload 校验是否过长？ | 这是生产 RPC 的安全边界；删除会让客户端绕过 Zod 直接写入坏分析。 | PASS | — |
| `cloud/functions/meal-photo-analysis/src/handler.ts:122` | 重试逻辑是否应该做队列？ | 首版只要求 JSON 校验失败重试一次；未引入后台队列，符合简化审计。 | PASS | — |

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/database/migrations/0004_photo_meal_analysis.sql:60` | `create_my_photo_meal_analysis` 是否暗示可传 user_id？ | `my` 与既有 RPC 风格一致；arguments shape 测试确保无 `user_id`。 | PASS | — |
| `cloud/functions/meal-photo-analysis/src/handler.ts:40` | `MealPhotoAnalysisDatabaseGateway` 是否表达外部边界？ | 只暴露 handler 所需 DB 操作，无 raw DB client。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| — | 是否有 TODO 或注释掩盖复杂度？ | 无新增 TODO；复杂约束由测试与 SQL 条件显式表达。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| `tests/security/pgliteAuthHarness.ts:7` | 迁移按序加入 harness，沿用现有生产迁移验证路径 | — | PASS |
| `tests/security/migrationShape.test.ts:23` | 将 `ai_analyses` 纳入同一 shape 测试，未创建平行安全检查系统 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/functions/meal-photo-analysis/src/handler.ts:165` | handler 是否直接依赖 CloudBase SDK 或模型 SDK？ | 否；纯依赖注入，后续部署层可单独接入 SDK。 | PASS | — |
| `cloud/database/migrations/0004_photo_meal_analysis.sql:329` | confirm 是否复用正式 meals 模型，而不是新增 food_items？ | 是；首版按候选项创建 `meals`，符合简化审计。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/security/photoMealAnalysisIsolation.test.ts:92` | 安全测试是否覆盖用户可见主链路？ | 覆盖 create/get/confirm 写 meal、A/B 隔离、直接权限、非法 payload、discard/confirmed 状态。 | PASS | — |
| `cloud/functions/meal-photo-analysis/src/handler.test.ts:69` | handler 测试是否覆盖 provider 失败？ | 覆盖坏 JSON 后重试、第二次 provider reject 后写 failed 安全分析。 | PASS | — |

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
| M1 | 功能 | `cloud/database/migrations/0004_photo_meal_analysis.sql:116` | 初版 DB create RPC 只校验顶层 payload，可能接受 `confidence > 1` 的坏候选项。 | 已修复：补 RED，并在 create/confirm RPC 中深度校验候选项。 |

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

Task 4 可以提交并推送。真实 CloudBase / 模型 smoke 未执行，保持 blocked；需要隔离环境、服务端模型配置和测试图片策略准备后再做。
