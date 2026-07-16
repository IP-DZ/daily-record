# 评审报告：`2026-07-15-offline-drafts`

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 未提交工作树 |
| Author | Codex |
| Review Date | 2026-07-15 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | `eslint .` 通过 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` 通过 |
| Focused 单测 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/offline/BrowserOfflineDraftRepository.test.ts src/features/today/TodayPage.test.tsx src/features/weight/WeightPage.test.tsx src/features/workouts/WorkoutsPage.test.tsx src/app/App.test.tsx` | PASS | 5 files / 44 tests |
| 全量单测 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 44 files / 419 tests |
| Diff check | `git diff --check` | PASS | 无空白错误 |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` | 草稿必须按用户隔离；不得保存照片、验证码、token、session、签名 URL 或云密钥；storage 不可用不阻断主表单 | 已应用 |
| 既有 onboarding draft 模式 | localStorage key 使用 user namespace；坏 JSON / invalid shape 清除；不枚举其它用户 namespace | 已应用 |

**使用规则：** 历史 learning 只作为 review lenses；以下结论均基于当前 diff、测试和验证命令。

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 未发现生产密钥；`rg` 命中的是计划文档安全约束、测试里的敏感字段哨兵字符串、既有 public test config | — | PASS |
| 注入风险 | 本次不新增 SQL/网络请求；localStorage key 对 userId/pageKey 使用 `encodeURIComponent`（`BrowserOfflineDraftRepository.ts:20-31`） | — | PASS |
| XSS 风险 | 草稿值只进入受控 input value，不使用 `dangerouslySetInnerHTML` | — | PASS |
| 依赖 CVE | 不新增依赖；复用项目已有 `zod` | — | PASS |
| 日志敏感数据 | 前端未新增生产日志；草稿失败被静默降级，不输出用户输入 | — | PASS |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? Are any of them wrong? | 假设首版只需要本地草稿，不做后台同步；计划和代码均限定为 localStorage 草稿，并把真实云端 smoke 作为后续 blocker | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | 通用 repository 只有 load/save/clear；页面逻辑为恢复、丢弃、提交清除，没有引入同步队列或状态机 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? | 变更集中在 `src/platform/offline`、三个表单页面、App 注入和测试；App/index 额外改动是为真实路由暴露 schema 与 user-scoped repo | PASS | — |
| Goal-Driven Execution | Do the tests prove the feature works? | RED 先证明缺少 repository/页面提示/App 注入会失败；GREEN 覆盖 key scope、跨用户隔离、坏 JSON、strict schema、恢复/丢弃/提交清除和路由注入 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `BrowserOfflineDraftRepository.ts:7-17` | 通用 repository 是否过度抽象？ | 三个页面共享同一 load/save/clear 端口，schema 由页面定义，避免把表单细节放入平台层 | PASS | — |
| `App.tsx:131-143` | App 是否应该知道页面草稿 schema？ | App 是唯一同时拥有 auth userId 和 storage 的层；页面 schema 只用于创建 user-scoped repo，不改变业务仓库 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `BrowserOfflineDraftRepository.ts:43-61` | 坏 JSON / invalid shape 会不会污染后续恢复？ | load 失败时清除当前 key 并返回 null；测试覆盖 malformed JSON 和 invalid shape | PASS | — |
| `TodayPage.tsx:155-161`、`WeightPage.tsx:109-114`、`WorkoutsPage.tsx:117-133` | 自动保存会不会阻断主表单？ | save error 被 catch；storage 不可用时 App 不注入 repository；页面仍可提交业务数据 | PASS | — |
| `TodayPage.tsx:235-240`、`WeightPage.tsx:188-194`、`WorkoutsPage.tsx:207-214` | 业务保存成功但清草稿失败会不会回滚用户数据？ | 清草稿失败被隔离；业务保存已成功，继续刷新列表 | PASS | — |
| `App.tsx:292-363` | 切换用户会不会读到别人草稿？ | repo 用 AuthGate 的 `user.userId` 创建；repository key 包含 `user:${encodeURIComponent(userId)}`；测试覆盖 App 当前用户 namespace | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入
- [x] 边界值 / 最大尺寸
- [x] 负数 / 非法值
- [x] 竞态 / 死锁
- [x] 外部依赖失败
- [x] 并发访问

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `BrowserOfflineDraftRepository.ts:33-72` | 是否需要 class？ | 与既有 BrowserDraftSettingsRepository 风格一致，便于测试和 App 注入；没有额外状态机 | PASS | — |
| 三个页面 draft effects | 是否应抽 hook？ | 当前只三处，抽 hook 会要求跨页面类型/restore 回调，复杂度不降；重复少量清晰代码更可审 | PASS | — |

**过度设计检查：**
- [x] 无投机抽象（解决“以后可能需要”的问题）
- [x] 无未使用的泛型参数 / hooks
- [x] 无不必要的间接层
- [x] 核心需求可用更少代码实现

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `OfflineDraftRepository` | 是否暗示云端或同步？ | 名称明确 offline；方法只有 load/save/clear | PASS | — |
| `pendingDraft` | 是否表示已经自动恢复？ | pending 表示等待用户确认的草稿；UI 提供恢复/丢弃 | PASS | — |

**命名问题：**
- [x] 无模糊命名（data、info、helper、manager）
- [x] 函数名不隐藏副作用
- [x] 无未解释缩写
- [x] 不读实现也能从名字预测行为

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `TodayPage.tsx:198-199` 等 | catch 注释是否解释 why？ | 注释说明“本地草稿只是便利功能，不阻断主表单 / 不回滚业务保存”，解释降级策略 | PASS | — |

**注释质量检查：**
- [x] 注释解释 WHY，而不是 WHAT
- [x] 无不可执行 TODO
- [x] 无代码变化后容易失真的注释
- [x] 复杂度被简化，而不是靠注释掩盖

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| — | 无发现 | — | PASS |

**风格检查：**
- [x] 遵循项目风格指南
- [x] 风格改动未混入功能改动
- [x] 格式与周边代码一致

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` | 源计划是否仍是单一进度源？ | Task 1 实际 write set、验证证据、resume point 已回写计划；未新增 JSON 任务状态 | PASS | — |
| `src/features/*/index.ts` | export schema 是否污染 public API？ | 这些 index 已是 App 的页面入口；schema export 只服务 App wiring，类型边界清楚 | PASS | — |

**系统健康检查：**
- [x] 看过完整文件，而不是只看 diff
- [x] 没有新增不必要耦合
- [x] 后续开发者工作更容易，而不是更难
- [x] 死代码 / 过期文档已移除

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `BrowserOfflineDraftRepository.test.ts:50-99` | repository 测试能否抓住 key scope / invalid shape / sensitive extra fields？ | 覆盖 scoped key、跨用户不 fallback、清除当前 key、坏 JSON/invalid shape 清理、strict schema 拒绝 extra token | PASS | — |
| `TodayPage.test.tsx`、`WeightPage.test.tsx`、`WorkoutsPage.test.tsx` | 页面测试是否验证用户可控恢复/丢弃/提交清除？ | Today/Weight 覆盖恢复后保存并 clear；Workouts 覆盖丢弃并 clear | PASS | — |
| `App.test.tsx:190-220` | 真实路由是否按 userId 注入？ | 测试预置 `user-today` namespace，认证恢复后 `/today` 显示草稿提示 | PASS | — |

**测试质量检查：**
- [x] 故意破坏实现时测试会失败（RED 已记录）
- [x] 测试验证行为，而不是实现细节
- [x] 4.2 识别的边界场景都有测试
- [x] 不读实现也能读懂测试断言
- [x] Mock 不会构造脱离真实代码的幻想版本

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

### 结论

- [ ] **BLOCK** — 提交前必须解决发现项
- [x] **APPROVE** — 所有门禁通过，建议执行 `/anvil:compound`

### 评审备注

Task 1 可提交。下一步按计划进入 Task 2「隐私设置与清空应用数据」；真实 CloudBase / 模型 / 大陆网络 smoke 仍在计划 blocker 中，不得伪报自动通过。
