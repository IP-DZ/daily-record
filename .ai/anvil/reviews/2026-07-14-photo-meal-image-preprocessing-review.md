# 评审报告：2026-07-14-photo-meal-image-preprocessing

## 元数据

| 字段 | 值 |
|------|----|
| Reviewer | anvil-lead |
| MR / Commit | 本地未提交 Task 2 diff |
| Author | Codex |
| Review Date | 2026-07-14 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|--------|------|------|------|
| Lint | `pnpm_config_verify_deps_before_run=warn pnpm lint` | PASS | `eslint .` exit 0 |
| 类型检查 | `pnpm_config_verify_deps_before_run=warn pnpm typecheck` | PASS | `tsc -b --pretty false` exit 0 |
| 单元测试 | `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/image/prepareMealPhoto.test.ts` | PASS | 1 个测试文件、6 条测试通过 |
| Diff whitespace | `git diff --check` | PASS | 无 whitespace error |

---

## 历史经验检查

| Source | Applied lens | Result |
|--------|--------------|--------|
| 当前 plan 的“关键模式检查” | 浏览器不上传原图到持久存储、不记录图片内容、不把 AI/云凭据带到浏览器 | PASS：Task 2 仅做本地读取、压缩和 schema 校验；未新增网络、存储、日志或密钥 |
| `docs/solutions` | 无可读取历史知识库 | N/A |

---

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|------|------|----------|------|
| 硬编码密钥 | 未新增密钥、token、模型配置或 `VITE_` 模型变量 | — | PASS |
| 注入风险 | 未新增 SQL/NoSQL/HTML 拼接或网络请求 | — | PASS |
| XSS 风险 | 未新增 HTML 注入；仅返回 data URL 给后续云函数调用 | — | PASS |
| 依赖 CVE | 未新增依赖 | — | PASS |
| 日志敏感数据 | 未新增日志；错误文案不包含文件路径或 data URL | — | PASS |

**安全结论：** CLEAN

---

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 作者回答（显式或推断） | 结论 | 严重级别 |
|------|------------|--------------------------|------|----------|
| Think Before Coding | What assumptions is the author making that they never wrote down? Are any of them wrong? | 假设首版只支持 JPEG/PNG/WebP，输出 JPEG/WebP；这些约束与 plan、Task 1 合约一致。 | PASS | — |
| Simplicity First | Can 50% of this code be deleted without losing functionality? | 默认浏览器适配器和可注入 adapter 是测试 canvas 行为的最小隔离；未新增持久化或上传层。 | PASS | — |
| Surgical Changes | Can I trace every changed line back to a specific requirement? | 所有新增文件都在 Task 2 Ownership `src/platform/image/**`。 | PASS | — |
| Goal-Driven Execution | Do the tests prove the feature works? | 测试覆盖横图/竖图缩放、不放大、JPEG 输出、非图片拒绝、超大输出、安全错误和 schema 兜底。 | PASS | — |

**Karpathy Score:** 4/4

---

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.ts:46` | 为什么需要 adapter，而不是直接在测试里 mock DOM？ | jsdom 不提供真实图片解码/canvas 压缩；adapter 让业务逻辑可测，同时默认实现仍是浏览器原生路径。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:198` | 为什么输出还要走合约 schema？ | Task 1 合约是云函数请求边界；预处理端口应复用同一安全约束。 | PASS | — |

**维度结论：** PASS

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.ts:60` | 非图片或不支持格式是否会进入解码？ | 仅允许 JPEG/PNG/WebP；测试验证 text/plain 不触发渲染。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:67` | 横图/竖图最长边是否正确缩到 1600 且不放大小图？ | `calculateTargetSize` 使用 long edge scale；测试覆盖 2400x1200、900x2400、800x600。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:193` | 超过 1.5 MB 的压缩结果是否拒绝且错误安全？ | `sizeBytes > maxOutputBytes` 抛 `output-too-large`；测试验证错误不含路径和 data URL。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:62` | `originalName` 是否可能泄露路径？ | `safeOriginalName` 去除 `/` 和 `\` 前缀路径；测试覆盖 `private/path/dinner.png`。 | PASS | — |

**已检查关键边界：**
- [x] 空输入 / null 输入：TypeScript 调用方约束；运行时非法输出由 schema 拦截。
- [x] 边界值 / 最大尺寸：最长边 1600、输出 1.5 MB、图片尺寸由 Task 1 schema 兜底。
- [x] 负数 / 非法值：adapter 非法输出由 `preparedMealPhotoSchema` 拦截为 `invalid-output`。
- [x] 竞态 / 死锁：单次 async pipeline，无共享可变状态。
- [x] 外部依赖失败：FileReader/Image/canvas 异常映射为稳定错误码。
- [x] 并发访问：函数无全局状态，多个调用互不共享结果。

**维度结论：** PASS

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.ts:8` | 错误码 union 是否过度设计？ | 后续 UI 需要按错误类型显示可恢复文案；错误码是稳定边界。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:79` | base64 size 估算是否多余？ | 默认 canvas 只返回 data URL，不返回二进制大小；需要本地大小限制。 | PASS | — |

**维度结论：** PASS

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.ts:62` | `safeOriginalName` 是否表达了它的作用？ | 它去路径、裁剪长度并提供 fallback，名称与行为匹配。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:135` | `prepareMealPhoto` 是否隐藏上传或持久化副作用？ | 函数只本地读取/压缩/返回对象；无上传、存储、日志。 | PASS | — |

**维度结论：** PASS

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| — | 是否有注释掩盖复杂度或 TODO 债务？ | 新增代码无注释和 TODO，行为由命名和测试表达。 | PASS | — |

**维度结论：** PASS

### 4.6 风格与一致性

| 行号 | 问题 | 类型（Block / Nit） | 状态 |
|------|------|--------------------|------|
| `src/platform/image/index.ts:1` | 使用现有平台模块 barrel export 风格 | — | PASS |
| `src/platform/image/prepareMealPhoto.test.ts:18` | 测试使用小型 fake adapter，符合现有注入式测试风格 | — | PASS |

**维度结论：** PASS

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.ts:143` | 默认实现是否把浏览器 API 局限在 platform 层？ | 是；UI 后续只调用端口，不需要直接操作 FileReader/Image/canvas。 | PASS | — |
| `src/platform/image/prepareMealPhoto.ts:198` | 是否与 Task 1 合约保持一致，避免双重标准？ | 是；输出必须通过 `preparedMealPhotoSchema`。 | PASS | — |

**维度结论：** PASS

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|------|------|----------|----------|----------|
| `src/platform/image/prepareMealPhoto.test.ts:43` | 测试是否验证尺寸缩放而不是只看函数返回？ | 断言 adapter 收到的 target width/height/mime。 | PASS | — |
| `src/platform/image/prepareMealPhoto.test.ts:105` | 安全错误是否有测试？ | 断言错误码且不包含路径或 `data:image`。 | PASS | — |

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

Task 2 可以提交并推送；后续继续 Task 3。真实浏览器相机/相册交互会在 Task 5 UI 与 Task 6 移动 E2E 中覆盖；当前 Task 2 已用可注入 adapter 验证压缩决策和安全输出。
