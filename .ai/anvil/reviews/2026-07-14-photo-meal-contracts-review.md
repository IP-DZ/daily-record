# 评审报告：2026-07-14-photo-meal-contracts

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地未提交 Task 1 diff |
| Author | Codex |
| Review Date | 2026-07-14 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | `eslint .` exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` exit 0 |
| 单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/photoMeal.test.ts src/domain/photoMeal/photoMealAnalysis.test.ts` | PASS | 2 个测试文件、20 条测试通过 |
| Diff whitespace | `git diff --check` | PASS | 无 whitespace error |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| 当前 plan 的“历史经验约束” | 页面不得直连 CloudBase SDK、客户端命令不接收 `userId`、错误/日志不能泄露 provider 或照片内容 | PASS：Task 1 仅新增共享合约与纯函数，无 SDK、日志、网络或 provider 字段 |
| `docs/solutions` | 无可读取历史知识库 | N/A |

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 未新增密钥、token、模型配置或 `VITE_` 模型变量 | — | PASS |
| 注入风险 | 未新增 SQL/NoSQL/HTML 拼接或网络请求 | — | PASS |
| XSS 风险 | 未新增 DOM 渲染或 HTML 注入点 | — | PASS |
| 依赖 CVE | 未新增依赖 | — | PASS |
| 日志敏感数据 | 未新增日志；合约拒绝公开 URL 形态 `imageObjectKey` | — | PASS |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? Are any of them wrong? | 假设照片分析只在确认前保存估算，客户端不携带用户身份；这些约束已写入 plan 和 schema。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? What would happen if I inlined every abstraction? | 合约和 3 个纯函数是后续 Task 2–5 的共享边界；未新增仓储、SDK 或投机服务层。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? Is there any line whose purpose I cannot explain after reading it three times? | 新增文件均落在 Task 1 Ownership；`packages/contracts/src/index.ts` 只导出新增合约。 | PASS | — |
| Goal-Driven Execution | If I delete the tests, do I still know what this code is supposed to do? Do the tests prove the feature works, or do they just prove the code runs? | 测试覆盖严格 schema、坏输入拒绝、低置信度判断、营养合计和候选转餐食输入。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.ts:18` | 图片候选和分析 DTO 是否应该作为共享合约存在？ | 后续浏览器、test platform、CloudBase 云函数和 UI 都依赖同一 JSON 边界。 | PASS | — |
| `src/domain/photoMeal/photoMealAnalysis.ts:23` | 纯函数是否属于领域层而不是平台层？ | 函数无浏览器、CloudBase、网络、时间依赖，可被 UI 和测试复用。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.ts:95` | `dataUrl` 和 `mimeType` 是否可能矛盾？ | 初版测试遗漏；已补失败测试并用 `superRefine` 要求一致。 | PASS | — |
| `packages/contracts/src/photoMeal.ts:115` | `imageObjectKey` 会不会接受公开 URL 或签名 URL？ | `isPrivateObjectKey` 要求 `users/` 前缀并拒绝 `://`、`?`、`#`。 | PASS | — |
| `src/domain/photoMeal/photoMealAnalysis.ts:35` | 低置信度和补充问题是否都会要求用户输入？ | 总体置信度、分析问题、候选置信度、候选问题均纳入判断。 | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入：schema 层由 Zod 类型拒绝；确认 items 为空有测试。
- [x] 边界值 / 最大尺寸：候选最多 12、问题最多 5、图片最大 1.5 MB、尺寸整数范围有约束。
- [x] 负数 / 非法值：克数、营养、置信度越界有测试。
- [x] 竞态 / 死锁：Task 1 无并发或异步状态。
- [x] 外部依赖失败：Task 1 无外部依赖；后续 Task 3/4 覆盖平台和模型失败。
- [x] 并发访问：Task 1 无持久化访问；后续迁移/RPC 覆盖用户隔离和事务。

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.ts:70` | schema 常量是否过度抽象？ | 常量只复用日期、ID、候选文本、问题长度，减少重复约束漂移。 | PASS | — |
| `src/domain/photoMeal/photoMealAnalysis.ts:10` | `emptyTotals` 是否多余？ | 它避免在 reducer 初始值内重复营养字段，并保持类型清晰。 | PASS | — |

**过度设计检查：**
- [x] 无投机抽象（解决“以后可能需要”的问题）
- [x] 无未使用的泛型参数 / hooks
- [x] 无不必要的间接层
- [x] 核心需求可用更少代码实现

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.ts:76` | `isPrivateObjectKey` 是否清楚表达安全边界？ | 名称准确描述它验证的是私有对象 key，而不是 URL。 | PASS | — |
| `src/domain/photoMeal/photoMealAnalysis.ts:35` | `analysisNeedsUserInput` 是否隐藏副作用？ | 函数名是谓词，实际无副作用。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| — | 是否有解释性注释掩盖复杂度？ | 新增代码无注释，约束由 schema 和测试表达。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| `packages/contracts/src/index.ts:15` | 新导出放在 meals 后，符合现有 barrel export 风格 | — | PASS |
| `src/domain/photoMeal/photoMealAnalysis.ts:1` | 使用 type-only imports，符合现有 TypeScript 风格 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.ts:131` | create input 是否避免客户端伪造用户身份？ | 输入只有 `mealDate`、`requestId`、`photo`；额外 `userId` 测试拒绝。 | PASS | — |
| `packages/contracts/src/photoMeal.ts:139` | confirm input 是否避免确认空结果？ | `items` 要求 1..12；空数组测试拒绝。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `packages/contracts/src/photoMeal.test.ts:76` | 测试是否覆盖关键拒绝场景？ | 覆盖额外字段、坏日期、空名、负数、置信度、URL、超大图片、非图片、MIME 不一致、空确认。 | PASS | — |
| `src/domain/photoMeal/photoMealAnalysis.test.ts:34` | 纯函数测试是否验证行为而非实现？ | 测试断言营养合计、低置信度/问题判断和餐食输入输出形状。 | PASS | — |

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
| M1 | 功能 | `packages/contracts/src/photoMeal.ts:95` | 初版 `PreparedMealPhoto` 未要求 `dataUrl` MIME 与 `mimeType` 一致。 | 已修复：新增失败测试并用 `superRefine` 校验一致。 |

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

Task 1 可以提交并推送；后续继续 Task 2。真实 CloudBase / 模型 smoke 仍按计划保持 blocked，直到隔离环境、服务端模型配置和测试图片策略准备完成。
