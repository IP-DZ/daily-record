# PWA/部署运维加固审阅

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地 Task 3 diff，目标提交 `chore: harden pwa deployment checks` |
| Author | Codex |
| Review Date | 2026-07-15 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | exit 0 |
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | exit 0 |
| 全量单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 48 files / 432 tests |
| Production build | `pnpm_config_verify_deps_before_run=warn pnpm build` | PASS | `index` gzip 112.79 KB；CloudBase chunk gzip 181.15 KB；Vite >500 KB chunk warning 已记录为后续优化 |
| 构建产物安全扫描 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts` | PASS | 1 file / 4 tests |
| Focused PWA/App | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts src/app/PwaUpdatePrompt.test.tsx src/app/App.test.tsx` | PASS | 3 files / 30 tests |
| Diff whitespace | `git diff --check` | PASS | exit 0 |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md` | 生产产物不得含服务端密钥、固定测试 OTP、测试邮箱、test-platform endpoint/chunk | PASS：RED 先复现 `createTestPlatform` chunk 泄漏；修复后 build scan 通过 |
| `.ai/anvil/reviews/2026-07-15-offline-drafts-review.md` | PWA/离线提示不得误导用户认为私有数据离线缓存 | PASS：离线提示明确只缓存静态应用外壳，不缓存餐食照片或账号接口 |
| `.ai/anvil/reviews/2026-07-15-account-deletion-review.md` | 真实 CloudBase/模型/大陆网络 blocker 不能伪报自动通过 | PASS：部署文档和计划均保留 owner/next step |

**使用规则：** 历史 learning 只作为 review lenses；finding 必须基于当前 diff 和验证证据。

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | `.env.example` 仅含 `VITE_*` 空占位；build scan 未发现服务端 secret marker | — | CLEAN |
| 注入风险 | 无新增 SQL/命令拼接；文档命令不含真实凭据 | — | CLEAN |
| XSS 风险 | PWA 提示新增固定中文文案，不渲染用户输入 | — | CLEAN |
| 依赖 CVE | 未新增依赖 | — | CLEAN |
| 日志敏感数据 | 未新增生产日志；文档要求 smoke 摘要不得记录邮箱、验证码、session/token、照片对象 key 或模型原文 | — | CLEAN |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? Are any of them wrong? | 假设本地无法证明真实大陆网络和真实云服务；文档明确 blocker，不把 test-platform 当真实 smoke。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | 新增核心是一个安全扫描测试、一份部署文档、一处 Workbox denylist、一句 PWA 文案和生产剥离 plugin；没有引入新部署框架。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a requirement? | 所有变更指向构建产物安全、PWA 缓存边界、部署文档或 RED 发现的 test-platform chunk 泄漏。 | PASS | — |
| Goal-Driven Execution | Do tests prove behavior? | RED 先失败，明确证明旧 dist 含测试平台 chunk；GREEN build scan 证明产物不含 forbidden markers。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `vite.config.ts:6` | 为什么需要构建期剥离，而不是只靠 `import.meta.env.MODE` runtime 分支？ | RED 证明 runtime 分支仍让 Rolldown 产出 `createTestPlatform` chunk 并被 SW precache；必须在 production transform 阶段移除动态 import。 | PASS | — |
| `tests/security/buildArtifactSafety.test.ts:61` | dist 缺失时跳过扫描是否弱？ | 默认 `pnpm test` 不应依赖 build 产物；发布门禁和计划要求 `pnpm build` 后单独运行该测试，已验证。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `vite.config.ts:15` | transform regex 如果将来匹配失败怎么办？ | 这是脆弱点，但 build artifact test 会扫描 dist 中的 test endpoint/client marker；匹配失败会重新 RED。 | PASS | — |
| `vite.config.ts:61` | Service Worker 是否仍会接管 API/test endpoint？ | `navigateFallbackDenylist` 排除 `/__*` 和 `/api/*`；未配置 runtimeCaching。 | PASS | — |
| `docs/operations/deployment.md:34` | 大陆 smoke 是否具体到可执行步骤？ | 覆盖首屏、登录数据闭环、拍照估算、清空数据、断网刷新；同时说明 blocker owner/next。 | PASS | — |

**已检查关键边界：**
- [x] dist 中 test endpoint / fixed OTP / test email / server secret marker
- [x] SW 不配置用户 API runtime caching
- [x] `/api/*`、`/__*` 导航不回退到 app shell
- [x] 真实 CloudBase/模型/大陆网络 blocker 不伪报
- [x] PWA 离线提示不暗示私有数据离线可用

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `vite.config.ts:6` | 构建 plugin 是否过度？ | 不加 plugin 时生产包泄漏测试平台代码；更简单的 runtime guard 已被 RED 否定。plugin 只处理一个文件、只在非 test mode 生效。 | PASS | — |
| `docs/operations/deployment.md` | 文档是否过细？ | 文档覆盖发布前门禁、CloudBase、自托管、大陆 smoke、预算和 blocker，都是 Task 3 成功标准。 | PASS | — |

**过度设计检查：**
- [x] 无新增部署系统或 CI 编排
- [x] 无真实密钥模板
- [x] 无后台同步/缓存策略扩张
- [x] 测试覆盖脆弱构建逻辑

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `stripTestPlatformFromProduction` | 名称是否精确？ | 只在非 test mode 的 production-like build 中剥离 test platform loader，名称准确。 | PASS | — |
| `buildArtifactSafety.test.ts` | 测试名是否表达范围？ | 同时覆盖 docs/env/PWA config 和 build artifact safety，文件名偏向重点风险；describe 补充完整范围。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `.env.example:1` | 注释是否必要？ | 明确该文件只允许浏览器公开配置，防止用户把服务端密钥/验证码写入样例。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| — | 未发现格式、lint 或风格阻断 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` | 是否违反单一 source-of-truth？ | Task 3 Actual Write Set、verification、evidence 和 resume point 已写回 active plan。 | PASS | — |
| `src/app/App.tsx:90` | App 源码仍保留 test platform loader，是否污染生产？ | 测试模式 E2E 需要；production transform + dist scan 证明正式包不含该代码。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `tests/security/buildArtifactSafety.test.ts:61` | 是否真的能抓到产物泄漏？ | RED 输出显示旧 dist 中 `createTestPlatform-*.js` 含 endpoint/client marker，修复后同一测试通过。 | PASS | — |
| `src/app/PwaUpdatePrompt.test.tsx:64` | PWA 文案测试是否只测文案？ | 文案本身是缓存边界用户提示要求，测试有效。 | PASS | — |
| `src/app/App.test.tsx` | 构建剥离是否破坏 test-platform E2E/unit 行为？ | Focused App 测试通过，mode test 仍可加载测试平台。 | PASS | — |

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
| M1 | 构建产物安全 | `dist/assets/createTestPlatform-*.js` | RED 阶段发现 production dist 包含 test-platform chunk、`__daily-record-test-platform` 和 `test-platform-client`。 | 已修复：新增 production transform 剥离 loader，重建后 build scan 通过。 |

### Low / Nit（可选）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| L1 | 性能 | `dist/assets/createCloudBasePlatform-*.js` | CloudBase SDK 动态 chunk gzip 181.15 KB，触发 Vite 原始 chunk >500 KB 警告。 | 非阻断：不在首屏 index chunk 内；Task 4/final readiness 继续记录，后续可考虑按页面懒加载平台 adapter。 |

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

Task 3「PWA/部署运维加固」可以提交。真实 CloudBase、真实视觉模型和中国大陆网络 smoke 仍为仓库所有者环境 blocker；本地证据只证明生产构建产物安全、PWA 缓存边界和部署文档准备度。
