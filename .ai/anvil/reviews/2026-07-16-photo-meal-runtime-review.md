# 评审报告：`2026-07-16-photo-meal-runtime`

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | pending local commit |
| Author | Codex |
| Review Date | 2026-07-16 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | ESLint 通过 |
| 类型检查 / 构建 | `pnpm_config_verify_deps_before_run=warn pnpm build` | PASS | `tsc -b && vite build` 通过；保留既有 Vite 大 chunk 警告 |
| 单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm test` | PASS | 49 files / 438 tests passed |
| 构建产物安全 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts` | PASS | production dist 扫描 4/4 |
| 移动 E2E | `pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line` | PASS | 8 passed / 1 real CloudBase manual skipped；本地监听需提权 |
| Diff whitespace | `git diff --check` | PASS | 无 whitespace error |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| `docs/anvil/plans/2026-07-14-photo-meal-analysis-plan.md` | 浏览器不得持有模型密钥；客户端不传 `userId`；真实模型 smoke 不能用 test platform 伪报 | 通过；服务端 `PHOTO_MEAL_*` 只在云函数文档和 runtime env 中出现，前端仓库仍不传身份 |
| `docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md` | Service worker / build artifact 不得缓存或泄露私有 API、测试端点、server secret marker | 通过；production build artifact safety 4/4 |

**使用规则：** 历史 learning 仅作为 review lens；本报告所有判断均基于当前 diff 和命令输出。

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 测试中使用 `server-only-secret` 作为假值；生产文档只列变量名，不给真实值 | Low | ACCEPTED |
| 注入风险 | 新增 RPC 参数为日期字符串并在 SQL 中用 regex + typed cast；无动态 SQL | — | CLEAN |
| XSS 风险 | 无前端渲染变更 | — | CLEAN |
| 依赖 CVE | 未新增依赖 | — | CLEAN |
| 日志敏感数据 | runtime 默认 no-op logger；文档明确不记录照片、签名 URL、模型响应或密钥 | — | CLEAN |
| 对象 key 隔离 | 初版 review 发现替换非法字符可能导致 user path 碰撞；已改为 SHA-256 base64url 哈希分段并加 RED/GREEN 测试 | High → fixed | RESOLVED |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | 是否有未写明假设？ | 模型 provider 只承诺 `http-json` / OpenAI-compatible JSON，不假装绑定某个未验证 SDK；真实 smoke 保持 blocker | PASS | — |
| Simplicity First | 能否删掉 50%？ | runtime 只包含 env loader、HTTP model、object storage、RPC gateway 和 factory；无队列/后台任务/多 provider 抽象 | PASS | — |
| Surgical Changes | 每行是否能追溯到需求？ | 改动集中在照片云函数真实 runtime、本地限流 RPC、部署文档和对应测试 | PASS | — |
| Goal-Driven Execution | 测试是否证明需求？ | RED 覆盖 runtime 缺失、count RPC 缺失、文档缺变量、对象 key 碰撞；全量验证覆盖回归 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `cloud/functions/meal-photo-analysis/src/runtime.ts` | 为什么不直接写死某个 CloudBase/模型 SDK？ | 当前仓库缺真实隔离环境和 provider 选择；写死未知 SDK 会制造不可验证代码。runtime factory 允许部署时注入 CloudBase storage/rdb，模型走通用 HTTP JSON。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `runtime.ts` object key | raw/sanitized user id 是否会泄露或碰撞？ | 初版存在风险；已改为 `hashedPathSegment()`，并用 RED/GREEN 证明 `user/a?bad` 与 `user-a-bad` 不碰撞。 | PASS | High fixed |
| `0004_photo_meal_analysis.sql` count RPC | 限流计数是否跨用户泄露？ | SQL 使用 `auth.uid()` 和 `meal_date`，测试覆盖 A/B 同日期隔离。 | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入
- [x] 边界值 / 最大尺寸
- [x] 负数 / 非法值
- [x] 外部依赖失败
- [x] 并发访问（RPC auth-bound，request id 幂等仍保留）

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `runtime.ts` | 是否过度抽象？ | 只保留当前部署必须的四个适配点；未实现多 provider 注册表或队列。 | PASS | — |

**过度设计检查：**
- [x] 无投机抽象
- [x] 无未使用泛型/hooks
- [x] 无不必要间接层
- [x] 核心需求可读

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `createRpcMealPhotoAnalysisDatabaseGateway` | 名称是否描述 side effect？ | 是，明确创建 RPC-backed database gateway。 | PASS | — |
| `hashedPathSegment` | 是否说明结果不可逆/非 raw？ | 是，名称与实现一致。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| — | 是否新增解释坏代码的注释？ | 未新增复杂注释；部署约束写在运维文档。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| — | 代码风格与现有 handler/repository adapter 一致；ESLint 通过 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| Anvil artifacts | 是否创建第二套状态系统？ | 否；进度折回现有 plan 和 review artifact。 | PASS | — |
| `.env.example` | 是否把服务端 secret 引入浏览器示例？ | 否；`.env.example` 仍只含 `VITE_*`。服务端变量只在部署文档描述。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `runtime.test.ts` | 是否测试行为而非 mock 自嗨？ | 测试验证实际 body、headers、object key、RPC 参数和响应解析；RED 记录完整。 | PASS | — |
| `photoMealAnalysisIsolation.test.ts` | 是否证明 count RPC 隔离？ | 是，A/B 同日期各自计数，坏日期拒绝。 | PASS | — |

**维度结论：** PASS

---

## 5. 发现项摘要

### Critical（阻塞提交）

无。

### High（阻塞提交）

| # | 维度 | 行号 | 描述 | 必须动作 |
|---|------|------|------|----------|
| H1 | 功能/安全 | `runtime.ts` object key | raw/sanitized user id 可能泄露或碰撞 | 已修复：使用 SHA-256 base64url 哈希分段，并加 RED/GREEN 测试 |

### Medium（强烈建议修复）

无。

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
| 评审文档完整 | [x] |

### 结论

- [ ] **BLOCK** — 提交前必须解决发现项
- [x] **APPROVE** — 所有门禁通过

### 评审备注

真实 CloudBase、真实模型 endpoint、真实测试邮箱和大陆网络 smoke 仍是外部环境 blocker。本轮只证明本地 runtime wiring、RPC 安全边界、生产构建和 test-platform E2E，不伪报真实云环境通过。
