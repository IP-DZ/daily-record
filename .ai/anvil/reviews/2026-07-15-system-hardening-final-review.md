# 系统加固、隐私删除与部署验收最终审阅

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地 Task 4 final diff，目标提交 `test: add system hardening e2e` |
| Author | Codex |
| Review Date | 2026-07-15 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | exit 0 |
| 单元/安全测试 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 48 files / 431 passed / 1 skipped；skip 为非 production marker 下的 dist scan |
| Production build | `pnpm_config_verify_deps_before_run=warn pnpm build` | PASS | `index` gzip 112.79 KB；CloudBase 动态 chunk gzip 181.15 KB |
| 构建产物安全扫描 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts` | PASS | 1 file / 4 tests |
| Focused system E2E | `pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line tests/e2e/system.spec.ts` | PASS | 1 passed；普通沙箱因 listen EPERM 失败，批准外部执行后通过 |
| Full mobile E2E | `pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line` | PASS | 8 passed / 1 real CloudBase manual skipped |
| Diff whitespace | `git diff --check` | PASS | exit 0 |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| `.ai/anvil/reviews/2026-07-15-offline-drafts-review.md` | 草稿必须用户隔离，不保存照片/验证码/token/session/签名 URL | PASS：Task 1 已审阅通过；系统 E2E 覆盖今日页草稿恢复 |
| `.ai/anvil/reviews/2026-07-15-account-deletion-review.md` | 删除操作必须只使用当前认证会话，不能前端传 userId | PASS：Task 2 审阅通过；系统 E2E 覆盖设置页清空后业务数据不可读 |
| `.ai/anvil/reviews/2026-07-15-pwa-deployment-hardening-review.md` | 生产产物不得含 test-platform endpoint/chunk 或服务端 secret marker | PASS：最终验证发现 test-mode dist 误扫后修复 `.build-mode` marker；production scan 通过 |

**使用规则：** 历史 learning 只作为 review lenses；结论均基于当前 diff、计划证据和命令输出。

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | build artifact scan 未发现服务端密钥标识、固定测试 OTP、测试邮箱、test-platform endpoint/client；`.env.example` 只有 `VITE_*` 空占位 | — | CLEAN |
| 注入风险 | 无新增 SQL；删除 RPC 已在 Task 2 审阅中证明零参数且只用 `auth.uid()` | — | CLEAN |
| XSS 风险 | 新增 E2E/文档/计划/review 不渲染用户输入 | — | CLEAN |
| 依赖 CVE | 未新增依赖 | — | CLEAN |
| 日志敏感数据 | 未新增生产日志；文档要求 smoke 摘要脱敏 | — | CLEAN |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? | 真实 CloudBase/模型/大陆网络无法由本地伪造；计划和部署文档明确 blocker owner/next step。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | Task 4 新增一个系统 E2E、两个计划回写和一个 final review；corrective fix 只增加 build mode marker。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a requirement? | 所有变更都对应系统 E2E、final validation bugfix、计划证据或 review。 | PASS | — |
| Goal-Driven Execution | Do tests prove the feature works? | E2E 覆盖核心系统闭环、草稿恢复、趋势和清空后不可读；full readiness path 通过。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/e2e/system.spec.ts:95` | 系统 E2E 是否重复已有单项 E2E？ | 单项 E2E 覆盖局部页面；系统 E2E 串起草稿、三类记录、趋势和清空数据，是 Task 4 成功标准。 | PASS | — |
| `vite.config.ts:30` | `.build-mode` marker 是否是必要复杂度？ | 最终验证证明 test-mode E2E 会覆盖 `dist`，导致 unit 误扫；marker 把 production scan 与 test dist 分离。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/e2e/system.spec.ts:122` | 草稿恢复是否真的被测？ | 填写餐食后不保存，SPA 导航离开再回来，断言“发现未提交草稿”、恢复按钮和字段值。 | PASS | — |
| `tests/e2e/system.spec.ts:153` | 清空应用数据后是否证明不可读？ | 清空后回到 today/weight/workouts，断言餐食合计归零且三类空状态出现。 | PASS | — |
| `tests/security/buildArtifactSafety.test.ts:61` | 非 production dist 跳过扫描会不会放过发布风险？ | 发布门禁明确 `pnpm build` 后运行该测试；production marker 下 scan 为 4/4 pass。 | PASS | — |

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/e2e/system.spec.ts` | 是否能用更少步骤覆盖目标？ | 该测试只覆盖一个 happy-path 系统流和一个删除后不可读断言，避免覆盖拍照模型等已由专项 E2E 证明的分支。 | PASS | — |

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `system.spec.ts` | 名称是否太泛？ | 文件用于 Task 4 的系统闭环验收；test 名完整描述保存、草稿、趋势和清空。 | PASS | — |
| `writeBuildModeMarker` | 名字是否表达副作用？ | 明确写构建模式 marker。 | PASS | — |

**维度结论：** PASS

### 4.5 注释

无新增复杂注释或 TODO。

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| — | 未发现风格阻断；`eslint .` 通过 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` | 是否仍保持单一 source-of-truth？ | Task 1–4 Code Status、verification、evidence、resume point 已写回 active plan；未创建 JSON 状态系统。 | PASS | — |
| `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md` | 主计划是否同步？ | 任务 9状态、证据和门禁表已更新。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/e2e/system.spec.ts:95` | E2E 是否验证可见用户结果？ | 所有断言都是页面可见标题、合计、趋势、空状态和确认文案。 | PASS | — |
| `tests/security/buildArtifactSafety.test.ts:61` | 是否有 regression 证据？ | 最终验证先失败：test-mode dist 被误扫；修复后全量 unit 通过且 production scan 通过。 | PASS | — |

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
| M1 | 测试边界 | `tests/security/buildArtifactSafety.test.ts:61` | 全量 unit 在 E2E test-mode dist 存在时误扫 `createTestPlatform` chunk。 | 已修复：构建写入 `.build-mode`，只有 production marker 扫描 dist；全量 unit 和 production scan 均通过。 |

### Low / Nit（可选）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| L1 | 性能 | production build | CloudBase 动态 chunk gzip 181.15 KB，原始 chunk >500 KB warning。 | 非阻断；首屏 `index` gzip 112.79 KB。后续真实大陆 LCP smoke 后再决定是否继续拆 CloudBase SDK。 |

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

系统加固 Task 1–4 本地实现、自动化验证、移动端 E2E、计划回写和审阅均通过。真实 CloudBase、真实视觉模型和中国大陆网络 smoke 仍为外部环境 blocker，不能在本地标记完成；已在主计划和运维文档中保留 owner 与 next step。
