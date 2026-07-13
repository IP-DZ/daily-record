# 评审报告：`2026-07-13-onboarding-foundation`

## 元数据

| 字段 | 值 |
|---|---|
| Reviewer | anvil-lead + 独立整分支 reviewer |
| MR / Commit | `feature/onboarding-foundation`，提交前写集 |
| Author | anvil-doer agents |
| Review Date | 2026-07-13 |
| Status | `APPROVED` |

---

## 1. 自动化预检

| 检查项 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 依赖一致性 | `CI=true pnpm install --offline --frozen-lockfile` | PASS | lockfile resolution skipped；无无关依赖漂移 |
| Lint | `CI=true pnpm lint` | PASS | 0 errors，0 warnings |
| 类型检查 | `CI=true pnpm typecheck` | PASS | TypeScript 无诊断 |
| 单元/组件测试 | `CI=true pnpm test` | PASS | 7 files，74 tests |
| 生产构建 | `CI=true pnpm build` | PASS | Manifest、Service Worker、Workbox 生成；12 precache entries |
| 移动端 E2E | `CI=true pnpm test:e2e -- --project=mobile-chromium` | PASS | 390×844，1/1；计算并刷新恢复草稿 |
| Diff 格式 | `git diff --check` | PASS | 无空白错误 |

## 历史经验检查

| Source | Applied lens | Result |
|---|---|---|
| `docs/solutions/` | 项目历史知识 | 目录不存在，无额外历史约束 |
| Anvil 主计划关键模式 | 领域纯函数、草稿不自动提交、静态 shell-only 缓存、平台端口边界 | PASS |

历史 learning 仅用于生成检查镜头；所有结论均由当前 diff、测试和构建证据支持。

## 2. 安全扫描

| 类别 | 发现 | 严重级别 | 状态 |
|---|---|---|---|
| 硬编码密钥 | `SECRET/PRIVATE_KEY/API_KEY/sk-` 扫描无真实命中 | — | CLEAN |
| 注入风险 | 本切片无数据库或动态 HTML 注入 | — | CLEAN |
| XSS 风险 | 未使用 `dangerouslySetInnerHTML` 或等价 sink | — | CLEAN |
| 依赖边界 | 浏览器不包含 CloudBase/AI 管理密钥；Node/pnpm 版本已声明 | — | CLEAN |
| 日志敏感数据 | 本切片未记录邮箱、验证码、图片或自由文本 | — | CLEAN |
| PWA 缓存 | 仅静态 precache；无用户 API、签名 URL、验证码或私有图片 runtime caching | — | CLEAN |

**安全结论：CLEAN**

## 3. Karpathy 对抗式原则

| 原则 | 对抗式问题 | 评审回答 | 结论 | 严重级别 |
|---|---|---|---|---|
| Think Before Coding | 隐含时序和平台假设是否已处理？ | 草稿恢复禁用表单；保存禁止并发；Storage/PWA 更新失败均显式呈现 | PASS | — |
| Simplicity First | 能否删除一半而不损失功能？ | 领域纯函数、一个 repository 端口和最小页面状态，无状态机或投机抽象 | PASS | — |
| Surgical Changes | 每行是否可追溯到切片需求？ | 43 个变更文件均属于构建、领域、首次设置、PWA、测试或状态证据 | PASS | — |
| Goal-Driven Execution | 测试是否证明行为而非只运行？ | 公式/边界、语义草稿、异步恢复、过期预览、并发保存、PWA 更新和移动流程均有行为测试 | PASS | — |

**Karpathy Score：4/4**

## 4. 对抗式维度评审

### 4.1 设计：它是否应该存在？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/platform/settings/index.ts:1` | feature 与平台边界是否清晰？ | App 只组合 feature/platform 公共入口；CloudBase 可替换 repository 实现 | PASS | — |
| `src/domain/nutrition/calculateNutritionTargets.ts:1` | 公式是否污染 UI？ | 纯 TypeScript，无 React、浏览器或 CloudBase 依赖 | PASS | — |

**维度结论：PASS**

### 4.2 功能：作者遗漏了什么？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/features/onboarding/OnboardingPage.tsx:120` | 异步保存能否乱序覆盖？ | `isSaving` guard 禁止重叠写入；revision 阻止过期状态回写 | PASS | — |
| `src/features/onboarding/OnboardingPage.tsx:69` | 恢复草稿能否覆盖用户输入？ | 恢复期间表单禁用并显示加载状态 | PASS | — |
| `src/platform/settings/browserDraftSettingsRepository.ts:50` | 结构合法但语义错误的草稿如何处理？ | 重算 targets 并按 `1e-6` 容差验证，否则清理 | PASS | — |

**已检查关键边界：**

- [x] 空输入 / 缺失 sex
- [x] 全部数值 min/max、刚越界、NaN/Infinity
- [x] 负碳水与五个活动系数
- [x] 异步恢复与并发保存
- [x] Storage 与 PWA 更新失败

**维度结论：PASS**

### 4.3 复杂度：还能更简单吗？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/features/onboarding/OnboardingPage.tsx:1` | 页面状态是否过度抽象？ | 使用局部 React state 和一个 repository 端口，未引入状态机/全局 store | PASS | — |

**过度设计检查：**

- [x] 无投机抽象
- [x] 无未使用泛型/hooks
- [x] 无不必要间接层
- [x] 功能实现保持最小

**维度结论：PASS**

### 4.4 命名：名字是否撒谎？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/platform/settings/SettingsRepository.ts:3` | 名称是否表达副作用？ | `saveDraft/loadDraft/clearDraft` 明确读写行为 | PASS | — |

**命名问题：无。维度结论：PASS**

### 4.5 注释：提供价值，还是替坏代码找借口？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| — | 是否存在不可执行 TODO 或解释性债务？ | 无 TODO；安全边界由代码、测试和运维文档表达 | PASS | — |

**维度结论：PASS**

### 4.6 风格与一致性

| 行号 | 问题 | 类型 | 状态 |
|---|---|---|---|
| — | TypeScript ESM、type-only imports、中文产品文案与现有配置一致 | Check | PASS |

**维度结论：PASS**

### 4.7 上下文：系统是否更健康？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md:13` | 是否只有一个实施状态源？ | active 主计划独占 Code Status/evidence/resume；需求文档只保留需求 | PASS | — |
| `docs/operations/local-development.md:1` | 下一位开发者能否复现？ | Node/pnpm 版本、命令与缓存边界已记录 | PASS | — |

**维度结论：PASS**

### 4.8 测试：证明有效，还是只是跑起来？

| 行号 | 提问 | 作者回答 | 评审判断 | 严重级别 |
|---|---|---|---|---|
| `src/domain/nutrition/calculateNutritionTargets.test.ts:1` | 活动系数回归是否会失败？ | 表驱动覆盖五个系数 | PASS | — |
| `src/features/onboarding/OnboardingPage.test.tsx:159` | 异步并发是否真实验证？ | deferred saves 证明 A pending 时不会启动 B，A 后显式保存最新 B | PASS | — |
| `tests/e2e/onboarding.spec.ts:1` | 移动流程是否验证可见结果？ | 390×844 直达、计算 2811 千卡、刷新恢复体重 | PASS | — |

**维度结论：PASS**

## 5. 发现项摘要

### Critical（阻塞提交）

无。

### High（阻塞提交）

无。

### Medium（强烈建议修复）

无。

### Low / Nit（可选）

无。

## 6. 门禁结论

| 门禁项 | 状态 |
|---|---|
| 所有自动化检查通过 | [x] |
| 安全扫描干净 | [x] |
| Karpathy score = 4/4 | [x] |
| 无未解决 Critical 问题 | [x] |
| 无未解决 High 问题 | [x] |
| 评审文档完整 | [x] |

### 结论

- [ ] **BLOCK** — 提交前必须解决发现项
- [x] **APPROVE** — 所有门禁通过，任务 1 可以创建保护性提交

### 评审备注

PWA 的真实 Service Worker 注册、离线导航、安装条件和更新生命周期仍按 active 主计划归任务 9；当前只将 PWA artifact、静态缓存边界、更新组件单测与移动业务流程标记为部分验收。
