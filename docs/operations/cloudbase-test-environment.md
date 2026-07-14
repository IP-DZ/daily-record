# CloudBase 隔离测试环境

## 用途与边界

本文档只用于验证邮箱 OTP、会话恢复、退出、两账号 RLS 与跨设备资料同步。必须使用与生产隔离的 CloudBase 环境和两个专用测试邮箱。不得把真实邮箱、验证码、session/token 或服务端密钥写入仓库、Playwright 配置、trace 或截图。

## 公开构建变量

在本地 shell 或不持久化的 CI secret 中配置：

```bash
export VITE_CLOUDBASE_ENV_ID='<isolated-environment-id>'
export VITE_CLOUDBASE_PUBLISHABLE_KEY='<publishable-key>'
export VITE_CLOUDBASE_REGION='ap-shanghai'
```

`VITE_*` 只允许客户端公开配置。禁止使用 `CLOUDBASE_APIKEY`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 或其他服务端凭据。

## 环境准备

1. 创建一个隔离 CloudBase 环境，开启邮箱 OTP，不放宽 CAPTCHA、频率限制或登录安全策略。
2. 按顺序执行 `cloud/database/migrations/` 中迁移，确认 `authenticated` 角色只可执行 `save_my_profile_settings` / `load_my_profile_settings` RPC，不具有 `profiles` / `nutrition_goals` 的任何表级或列级直接权限，且表级 RLS 已启用。两个 RPC 为固定 `search_path` 的 `SECURITY DEFINER` 函数，只从 `auth.uid()` 绑定当前账号，不接受 `user_id`；保存 RPC 在写入前按共享 `profileSettingsSchema` 等价规则严格拒绝额外字段、错误 JSON 类型、非法枚举、越界或非整数值。八条全 CRUD RLS 策略仍作为纵深防御保留。
3. 准备两个仅用于此环境的邮箱 A/B，并在每轮 smoke 前清空这两个账号的测试 profile/goal 数据。邮箱和实时 OTP 只在 headed 浏览器中手动输入，不设置为环境变量。
4. 执行默认自动证据：

   ```bash
   CI=true pnpm lint
   CI=true pnpm typecheck
   CI=true pnpm test
   CI=true pnpm build
   CI=true pnpm test:e2e -- --project=mobile-chromium
   ```

5. 显式启用人工 spec：

   ```bash
   CLOUDBASE_MANUAL_E2E=1 pnpm exec playwright test tests/e2e/cloudbase-auth.manual.spec.ts --project=mobile-chromium --headed --workers=1 --retries=0
   ```

   该 spec 在三个独立 BrowserContext 中依次暂停：操作人分别登录 A、B、A。每次只在当前 headed 窗口输入邮箱和实时 OTP，完成登录后点击 Playwright Inspector 的继续。不得用固定验证码替代这一证据。

   manual spec 在文件内显式关闭 `trace` / `screenshot` / `video`，不保存 `storageState`；不得为调试临时打开包含邮箱、OTP 或 session 的持久化产物。执行后只记录不含账号或 token 的 pass/fail 摘要。

## 两会话并发与跨设备 smoke

1. spec 自动创建三个全新 BrowserContext：A 设备 1、B 设备、A 设备 2；它们不共享 localStorage/cookie。
2. A 设备 1 保存体重 70 的可识别目标。B 首次登录必须看到空表单，保存体重 75 后，A/B 刷新仍分别是 70/75。
3. A 设备 2 登录后，在没有本地草稿时必须从云端加载 70。
4. A 设备 2 退出后必须立即回到登录页，刷新后仍为登录页。
5. 检查 CloudBase 审计记录与数据库结果，确认两个活跃 session 的 `auth.uid()` 各自限定所有读写。

## 已知 blocker 与负责人

当前仓库没有提供隔离环境 ID、Publishable Key 和两个隔离邮箱，因此真实 OTP、CAPTCHA/限流交互、CloudBase 双 session 并发与跨设备 smoke 仍为 `blocked`。负责人为仓库所有者；下一步是按本文档完成隔离环境配置，再运行 manual spec 并记录不含账号或 token 的结果摘要。
