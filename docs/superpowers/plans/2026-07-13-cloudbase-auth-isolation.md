# CloudBase 账号与数据隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. 本文步骤是静态执行说明，不记录完成状态；进度只写入 active Anvil 主计划。

**Goal:** 在中国大陆 CloudBase PG 环境中实现邮箱验证码登录、会话恢复、退出登录、资料与营养目标跨设备同步，并用可执行的 PostgreSQL RLS 测试证明双账号互不可读写。

**Architecture:** React 页面只依赖 `AuthPort` 和 `ProfileSettingsRepository`；CloudBase JS SDK 仅存在于 `src/platform/cloudbase`。邮箱 OTP 的一次性验证回调封装在适配器内部。资料与目标通过固定 `search_path`、撤销直接表 DML 的最小权限 `SECURITY DEFINER` PostgreSQL RPC 原子保存；RPC 从 `auth.uid()` 读取用户身份，客户端永远不提交 `user_id`。本地用 PGlite 执行同一份迁移并切换 `authenticated` 角色验证 RLS 与 RPC 权限边界。

**Tech Stack:** React 19、TypeScript 5.9、Vite 8、Zod 4、`@cloudbase/js-sdk@3.6.2`、CloudBase PostgreSQL、`@electric-sql/pglite@0.5.4`、Vitest、Testing Library、Playwright。

## Global Constraints

- 产品语言和项目文档默认中文，首版只面向 18 岁以上成年人。
- 第一版必须在中国大陆常用网络环境中可访问；CloudBase 地域默认为 `ap-shanghai`，允许显式配置 `ap-guangzhou`。
- 浏览器只允许读取 `VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_REGION` 和 `VITE_CLOUDBASE_PUBLISHABLE_KEY`；`API Key`、`secretId`、`secretKey` 及 AI 密钥不得进入前端源码或构建产物。
- `@cloudbase/js-sdk` 只能从 `src/platform/cloudbase/**` 导入；React 页面不得直接调用 CloudBase SDK。
- 每个用户拥有表必须含 `user_id`，默认拒绝匿名访问，并用 `GRANT + RLS` 同时约束 `SELECT/INSERT/UPDATE/DELETE`。
- 客户端不得提供或覆盖 `user_id`；SQL RPC 必须通过 `auth.uid()` 获取当前账号。`authenticated` 只获得 RPC EXECUTE，不获得用户表直接 DML；RPC 使用 `SECURITY DEFINER` 时必须固定 `search_path`、严格校验完整共享 payload 合约且不接受任意实体 ID。
- 浏览器健康草稿必须使用身份种类不相交的 localStorage 命名空间：访客为 `v2:guest`，登录用户为 `v2:user:<encodedUserId>`；访客草稿不得自动迁入任一登录账号，账号切换不得恢复上一账号数据，退出登录时清理当前账号本地健康草稿与内存查询状态。
- 日志不得包含完整邮箱、验证码、Access Token、Refresh Token 或自由文本；错误只暴露稳定错误码和可安全展示的中文说明。
- 真实邮箱验证码和 CloudBase 部署只在隔离测试环境验证；没有环境变量时记录明确 blocker，不得伪报真实 smoke 通过。
- Active Anvil 主计划仍是唯一任务状态来源；本文件只提供任务 2 的可执行步骤，不维护第二套 Code Status。

---

### Task 1: 共享认证合约与平台端口

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/profileSettings.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/contracts.test.ts`
- Create: `src/platform/auth/AuthPort.ts`
- Create: `src/platform/auth/authErrors.ts`
- Create: `src/platform/auth/index.ts`
- Create: `src/platform/settings/ProfileSettingsRepository.ts`
- Modify: `package.json`
- Modify: `tsconfig.app.json`

**Interfaces:**
- Consumes: `NutritionInputs`, `NutritionTargets`, `TrainingExperience`, `OnboardingDraftInput`。
- Produces:

```ts
export type UserId = string & { readonly __brand: 'UserId' };

export interface AuthUser {
  userId: UserId;
}

export interface AuthPort {
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<AuthUser>;
  currentUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
}

export interface ProfileSettingsRepository {
  load(): Promise<OnboardingDraftInput | null>;
  save(value: OnboardingDraftInput): Promise<void>;
}
```

- **Step 1: 写失败的合约边界测试**

在 `packages/contracts/src/contracts.test.ts` 用表驱动测试证明：空 `userId`、非法邮箱、非 6 位验证码、越界训练天数、非法经验值和缺少 `schemaVersion: 1` 均被 Zod schema 拒绝；合法 `AuthUser` 与 profile settings payload 被接受。

```ts
expect(() => emailCodeSchema.parse('12345')).toThrow();
expect(profileSettingsSchema.parse(validSettings).schemaVersion).toBe(1);
```

- **Step 2: 运行测试并确认 RED**

Run: `pnpm test -- --run packages/contracts/src/contracts.test.ts`

Expected: FAIL，原因是 `emailCodeSchema`、`profileSettingsSchema` 和公共导出尚不存在。

- **Step 3: 实现最小 workspace 合约包和端口**

`profileSettingsSchema` 必须复用任务 1 已验收的营养字段边界：年龄 18–100、身高 100–250、体重 30–350、蛋白质 1.6–2.2、脂肪比例 0.15–0.4、盈余比例 0–0.3、训练天数 0–7、活动等级五种、经验等级三种；响应保留完整小数。`authErrors.ts` 只定义稳定错误码：

```ts
export type AuthErrorCode =
  | 'auth/configuration'
  | 'auth/invalid-email'
  | 'auth/code-required'
  | 'auth/code-expired'
  | 'auth/code-invalid'
  | 'auth/captcha-required'
  | 'auth/rate-limited'
  | 'auth/network'
  | 'auth/session'
  | 'auth/unknown';
```

- **Step 4: 验证 GREEN 与依赖边界**

Run: `pnpm test -- --run packages/contracts/src/contracts.test.ts && pnpm typecheck`

Expected: PASS；`rg -n "@cloudbase/js-sdk" src packages` 无命中。

- **Step 5: 暂存任务写集供任务级评审**

Run: `git diff --check && git status --short`

Expected: 只出现本任务 Files 列表中的文件。

---

### Task 2: CloudBase v3 配置与 AuthPort 适配器

**Files:**
- Create: `src/platform/cloudbase/cloudBaseConfig.ts`
- Create: `src/platform/cloudbase/cloudBaseConfig.test.ts`
- Create: `src/platform/cloudbase/CloudBaseAuthAdapter.ts`
- Create: `src/platform/cloudbase/CloudBaseAuthAdapter.test.ts`
- Create: `src/platform/cloudbase/createCloudBasePlatform.ts`
- Create: `src/platform/cloudbase/createCloudBasePlatform.test.ts`
- Create: `src/platform/cloudbase/index.ts`
- Create: `.env.example`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1 `AuthPort`, `AuthUser`, `AuthErrorCode`。
- Produces: `readCloudBasePublicConfig(env)` 与 `createCloudBasePlatform(config)`；当前阶段后者只返回 `{ auth }`，SDK 实例不得泄漏到调用者。Task 5 接入真实资料仓库时再扩展为 `{ auth, profileSettings }`，不得用必定失败的占位端口冒充可用仓库。

- **Step 1: 写失败的配置和适配器测试**

覆盖以下行为：缺失环境 ID 或 Publishable Key 返回 `auth/configuration`；只接受 `ap-shanghai|ap-guangzhou`；邮箱统一 `trim().toLowerCase()`；`requestEmailCode()` 调用 `auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`；`verifyEmailCode()` 必须使用同一邮箱对应的 `verifyOtp({ token })`；未请求验证码、回调缺失、CloudBase `{ error }`、网络异常、会话缺失用户 ID 与退出失败均转换为稳定错误。

```ts
await adapter.requestEmailCode(' USER@Example.com ');
expect(signInWithOtp).toHaveBeenCalledWith({
  email: 'user@example.com',
  options: { shouldCreateUser: true },
});
```

- **Step 2: 运行测试并确认 RED**

Run: `pnpm test -- --run src/platform/cloudbase/cloudBaseConfig.test.ts src/platform/cloudbase/CloudBaseAuthAdapter.test.ts`

Expected: FAIL，原因是配置解析器和适配器不存在。

- **Step 3: 安装固定版本并实现最小适配器**

Run: `pnpm add @cloudbase/js-sdk@3.6.2`

适配器保存 `Map<normalizedEmail, verifyOtp>`，验证成功或明确不可重试失败后删除回调；不得把验证码、邮箱或 token 写入日志。`createCloudBasePlatform.ts` 是 SDK 唯一初始化点：

```ts
const app = cloudbase.init({
  env: config.envId,
  region: config.region,
  accessKey: config.publishableKey,
  timeout: 15_000,
});
```

- **Step 4: 验证 GREEN 和密钥边界**

Run: `pnpm test -- --run src/platform/cloudbase && pnpm typecheck && rg -n "@cloudbase/js-sdk" src --glob '!src/platform/cloudbase/**'`

Expected: 测试和类型检查 PASS；最后一个 `rg` 无命中。

- **Step 5: 暂存任务写集供任务级评审**

Run: `git diff --check && git status --short`

Expected: 无任务外文件。

---

### Task 3: PostgreSQL schema、事务 RPC 与 RLS 双账号测试

**Files:**
- Create: `cloud/database/migrations/0001_profiles_and_nutrition_goals.sql`
- Create: `tests/security/pgliteAuthHarness.ts`
- Create: `tests/security/userIsolation.test.ts`
- Create: `tests/security/migrationShape.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: CloudBase PG 预置 `auth.uid()`、`authenticated`、`service_role`。
- Produces: `public.profiles`、`public.nutrition_goals`、`public.save_my_profile_settings(jsonb)`、`public.load_my_profile_settings()`。

- **Step 1: 写失败的迁移和权限测试**

使用 PGlite 启动真实 PostgreSQL 语义测试：先创建测试用 `auth.uid()` 和角色，再执行生产迁移。以 `user-a` 通过 RPC 保存资料和目标后，切换为 `user-b`，验证 load RPC 返回空；`authenticated` 对两张底表的直接 SELECT/INSERT/UPDATE/DELETE 均被权限层拒绝，service role 只用于测试核对实际行。切回 A 可通过 RPC 读取并按顺序创建版本 1、2；真实双连接并发与行锁竞争留在隔离 CloudBase smoke 验证，不得由单连接 PGlite 冒充。

```ts
await asUser(db, 'user-a', () => saveSettings(db, first));
expect(await asUser(db, 'user-b', () => selectProfiles(db))).toEqual([]);
await expect(asUser(db, 'user-b', () => insertFor(db, 'user-a'))).rejects.toThrow();
```

`migrationShape.test.ts` 还必须断言两个用户表都启用 RLS、包含四类 policy、不给 `anon` 任何表权限、不给 authenticated 修改 `user_id` 的入口。

- **Step 2: 运行测试并确认 RED**

Run: `pnpm test -- --run tests/security/userIsolation.test.ts tests/security/migrationShape.test.ts`

Expected: FAIL，原因是迁移和安全测试 harness 不存在。

- **Step 3: 安装 PGlite 并实现最小迁移**

Run: `pnpm add -D @electric-sql/pglite@0.5.4`

迁移要求：

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
```

UPDATE 同时使用 `USING` 和 `WITH CHECK`，DELETE 使用 `USING`。`authenticated` 不得获得表级或列级直接 DML；`save_my_profile_settings` / `load_my_profile_settings` 必须为 `SECURITY DEFINER`、固定 `search_path`、拒绝空 `auth.uid()`，并在受信任边界执行与共享 `profileSettingsSchema` 等价的严格对象、枚举、范围和额外字段校验。`profiles.goal_version` 在同一事务原子递增并插入 `nutrition_goals`。RPC 参数只接收 `jsonb`，不接受 `user_id`。

- **Step 4: 验证 GREEN 与重复执行保护**

Run: `pnpm test -- --run tests/security && pnpm typecheck`

Expected: PASS；迁移在全新 PGlite 实例运行两次时第二次得到明确的对象已存在错误，而不是部分成功；每次测试使用全新实例保证可重复验证。

- **Step 5: 暂存任务写集供任务级评审**

Run: `git diff --check && git status --short`

Expected: 无任务外文件。

---

### Task 4: 登录 UI、会话恢复与退出

**Files:**
- Create: `src/features/auth/AuthPage.tsx`
- Create: `src/features/auth/AuthPage.test.tsx`
- Create: `src/features/auth/AuthGate.tsx`
- Create: `src/features/auth/AuthGate.test.tsx`
- Create: `src/features/auth/auth.css`
- Create: `src/features/auth/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: Task 1 `AuthPort`，Task 2 `createCloudBasePlatform`。
- Produces: `AuthGate` 在恢复会话期间显示 loading；未登录显示邮箱 OTP 页面；已登录渲染子页面并提供退出按钮。

- **Step 1: 写失败的组件行为测试**

覆盖：首次渲染只调用一次 `currentUser()`；恢复期间不闪现登录表单；邮箱非法不发请求；发送成功进入验证码阶段并启用 60 秒重发冷却；验证码必须 6 位；提交期间禁止并发；错误映射为中文且不显示原始邮箱/验证码；验证成功进入 onboarding；退出成功回到登录页；退出失败保留会话并允许重试。

- **Step 2: 运行测试并确认 RED**

Run: `pnpm test -- --run src/features/auth src/app/App.test.tsx`

Expected: FAIL，原因是 auth feature 和 App 集成不存在。

- **Step 3: 实现最小登录流程**

UI 文案明确“邮箱验证码用于注册或登录”；不显示“发送成功”前不得进入验证码阶段。倒计时只控制客户端按钮，不代替 CloudBase 服务端限流。遇到 `auth/captcha-required` 显示“需要完成安全验证，请稍后重试”，本切片不自行实现第三方 CAPTCHA 绕过。

App 通过依赖注入允许测试传入 fake ports；生产环境配置缺失时显示“尚未配置 CloudBase 测试环境”，仍允许访问离线营养计算演示，但不伪造已登录会话。

- **Step 4: 验证 GREEN 与日志/隐私**

Run: `pnpm test -- --run src/features/auth src/app/App.test.tsx && pnpm typecheck && rg -n "console\.(log|info|warn|error)" src/features/auth src/platform/cloudbase`

Expected: 测试与类型检查 PASS；`rg` 无命中。

- **Step 5: 暂存任务写集供任务级评审**

Run: `git diff --check && git status --short`

Expected: 无任务外文件。

---

### Task 5: 资料/目标同步、移动 E2E 与运维说明

**Files:**
- Create: `src/platform/cloudbase/CloudBaseProfileSettingsRepository.ts`
- Create: `src/platform/cloudbase/CloudBaseProfileSettingsRepository.test.ts`
- Modify: `src/platform/cloudbase/createCloudBasePlatform.ts`
- Modify: `src/platform/cloudbase/createCloudBasePlatform.test.ts`
- Modify: `src/features/auth/AuthGate.tsx`
- Modify: `src/features/auth/AuthGate.test.tsx`
- Modify: `src/features/onboarding/OnboardingPage.tsx`
- Modify: `src/features/onboarding/OnboardingPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/platform/settings/browserDraftSettingsRepository.ts`
- Modify: `src/platform/settings/browserDraftSettingsRepository.test.ts`
- Create: `src/platform/testing/createTestPlatform.ts`
- Create: `src/platform/testing/createTestPlatform.test.ts`
- Create: `tests/e2e/auth-onboarding.spec.ts`
- Create: `tests/e2e/cloudbase-auth.manual.spec.ts`
- Create: `docs/operations/cloudbase-test-environment.md`
- Modify: `playwright.config.ts`
- Modify: `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1 `ProfileSettingsRepository`，Task 3 RPC，Task 4 authenticated App state。
- Produces: `createCloudBasePlatform(config)` 扩展为 `{ auth, profileSettings }`；登录用户在 onboarding 保存时本地草稿与 CloudBase 同步；新设备无本地草稿时从 CloudBase 加载最新 profile/goal。

- **Step 1: 写失败的 repository 与 onboarding 同步测试**

测试 RPC payload 不含 `user_id/savedAt/email`；CloudBase `{ error }` 转为稳定 settings 错误；load schema 无效时拒绝污染 UI；当前 `userId` 的本地草稿优先保护未提交编辑；当前用户本地为空才加载云端；访客 key 与其他用户 key 永不作为当前账号 fallback；保存先保留当前用户本地草稿，再尝试云端，只有云端成功才显示同步成功；云端失败时保留表单和当前用户本地草稿并显示“云端同步失败，可重试”；退出时清理当前账号 key，不能删除其他账号 key。

- **Step 2: 运行测试并确认 RED**

Run: `pnpm test -- --run src/platform/cloudbase/CloudBaseProfileSettingsRepository.test.ts src/features/onboarding/OnboardingPage.test.tsx src/app/App.test.tsx`

Expected: FAIL，原因是 profile repository 与同步行为不存在。

- **Step 3: 实现 repository、同步顺序和测试后门**

生产 adapter 只调用：

```ts
await rdb.rpc('save_my_profile_settings', { payload });
await rdb.rpc('load_my_profile_settings');
```

`BrowserDraftSettingsRepository` 接受显式身份种类，登录态使用 `daily-record:onboarding-draft:v2:user:<encodedUserId>`，访客使用 `daily-record:onboarding-draft:v2:guest`；不得枚举或回退到别的 namespace。Playwright 通过仅在 `MODE === 'test'` 时启用的内存平台工厂执行邮箱、验证码、会话恢复、账号 A/B 切换、跨 browser context 目标加载和退出流程；生产构建必须 tree-shake 掉固定测试验证码。`cloudbase-auth.manual.spec.ts` 仅在显式提供隔离环境变量时运行，必须关闭 trace/screenshot/video 等 artifact，并通过多个真实 BrowserContext 分段验证 A/B 隔离、A 的跨设备回填与退出；邮箱和 OTP 只由操作人临时输入，不进入默认 CI 或持久化产物。

- **Step 4: 运行切片与全量验证**

Run:

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm test:e2e -- --project=mobile-chromium
git diff --check
```

Expected: 全部 PASS；构建产物扫描无 `CLOUDBASE_APIKEY`、`TENCENTCLOUD_SECRET`、固定测试验证码、真实邮箱和 token；初始 JavaScript gzip 仍不超过 250 KB。

- **Step 5: 更新唯一状态源并记录真实环境 blocker**

主计划 Task 2 写入 `Code Status`、`Actual Write Set`、`Verification`、`Evidence`；若未提供 CloudBase 环境 ID、Publishable Key 和两个隔离测试邮箱，则将“真实验证码、跨设备 CloudBase smoke”标为 `blocked` 或 `partial`，负责人为仓库所有者，下一动作为按 `docs/operations/cloudbase-test-environment.md` 配置隔离环境并运行 manual spec。

- **Step 6: 整分支评审前检查**

Run: `git status --short && git diff --stat main...HEAD && git diff --check`

Expected: 只包含计划批准写集；没有 `.env`、测试邮箱、验证码、token、`dist`、`node_modules` 或临时 Playwright 产物。

---

## 计划自审结论

- **规格覆盖**：邮箱 OTP、会话恢复、退出、按用户隔离的本地草稿、资料/目标同步、双账号 RLS、浏览器密钥扫描、移动 E2E 和真实环境 blocker 均有对应任务。
- **边界一致**：UI 只依赖端口；SDK 仅在 `src/platform/cloudbase`；SQL RPC 不接受 `user_id`；PGlite 执行与生产相同迁移。
- **范围控制**：本切片不实现账号删除、图片存储、餐次、体重、训练或生产部署；这些仍留在主计划后续任务。
- **已知环境缺口**：仓库当前没有 CloudBase 环境 ID、Publishable Key 或隔离测试账号，因此真实验证码和线上跨设备 smoke 不能在默认 CI 中完成；本地权限与合约证据不冒充真实云环境证据。
