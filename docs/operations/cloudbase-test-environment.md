# CloudBase 隔离测试环境

## 用途与边界

本文档用于验证首版完整 CloudBase 隔离环境：邮箱 OTP、会话恢复、退出、两账号 RLS、跨设备资料同步、业务表 RPC、`mealPhotoAnalysis` 云函数、服务端模型变量和清空应用数据。必须使用与生产隔离的 CloudBase 环境和两个专用测试邮箱。不得把真实邮箱、验证码、session/token、照片对象 key、模型响应原文或服务端密钥写入仓库、Playwright 配置、trace、截图或日志。

## 公开构建变量

在本地 shell 或不持久化的 CI secret 中配置；变量名与仓库根目录 `.env.example` 保持一致：

```bash
export VITE_CLOUDBASE_ENV_ID='<isolated-environment-id>'
export VITE_CLOUDBASE_PUBLISHABLE_KEY='<publishable-key>'
export VITE_CLOUDBASE_REGION='ap-shanghai'
```

`VITE_*` 只允许客户端公开配置。禁止使用 `CLOUDBASE_APIKEY`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 或其他服务端凭据。

部署静态产物和中国大陆网络 smoke 的完整步骤见 [部署与上线验收](./deployment.md)。本文只负责 CloudBase 隔离环境和真实 OTP/RLS/云函数证据，执行结果统一复制 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md) 填写；不记录真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文或 secret。

兼容历史验收口径：不记录真实邮箱、验证码、session、token、照片对象 key 或模型响应原文；新增模板进一步覆盖签名 URL 和 secret。

## 环境准备

1. 创建一个隔离 CloudBase 环境，开启邮箱 OTP，不放宽 CAPTCHA、频率限制或登录安全策略。
2. 按顺序执行 `cloud/database/migrations/` 中全部迁移，确认所有用户拥有表均启用 RLS，且 `authenticated` / `anon` 没有任何直接表级或列级权限。至少检查以下表：`profiles`、`nutrition_goals`、`meals`、`weight_entries`、`workouts`、`workout_exercises`、`workout_sets`、`ai_analyses`。
3. 确认生产 RPC 全部为固定 `search_path` 的 `SECURITY DEFINER`，只从 `auth.uid()` 绑定当前账号，不接受 `user_id` 参数。至少检查：`save_my_profile_settings`、`load_my_profile_settings`、`list_my_meals_by_date`、`create_my_meal`、`update_my_meal`、`delete_my_meal`、`copy_my_meal`、`list_my_weight_entries`、`create_my_weight_entry`、`update_my_weight_entry`、`delete_my_weight_entry`、`list_my_workouts`、`create_my_workout`、`update_my_workout`、`delete_my_workout`、`copy_my_latest_workout`、`create_my_photo_meal_analysis`、`get_my_photo_meal_analysis`、`confirm_my_photo_meal_analysis`、`discard_my_photo_meal_analysis`、`count_my_photo_meal_analyses_by_date`、`delete_my_application_data`、`list_my_nutrition_goals_by_date_range`。
4. 部署 `mealPhotoAnalysis` 云函数，并在函数级或服务端环境中配置以下变量。只记录变量名和是否配置完成，不记录值：

   ```bash
   CLOUDBASE_ENV_ID='<isolated-environment-id>'
   CLOUDBASE_PUBLISHABLE_KEY='<publishable-key>'
   CLOUDBASE_REGION='ap-shanghai'
   PHOTO_MEAL_MODEL_PROVIDER=http-json
   PHOTO_MEAL_MODEL_ENDPOINT='<server-side-vision-model-endpoint>'
   PHOTO_MEAL_MODEL_NAME='<vision-model-name>'
   PHOTO_MEAL_MODEL_API_KEY='<server-side-secret>'
   PHOTO_MEAL_DAILY_LIMIT=20
   ```

   `CLOUDBASE_PUBLISHABLE_KEY` 是 CloudBase 公开 key，只用于初始化当前隔离环境；不得把 TencentCloud SecretId / SecretKey、数据库管理密钥或其他服务端凭据填到这里。`PHOTO_MEAL_MODEL_API_KEY` 不得进入 `.env.example`、前端构建、浏览器 storage、日志或测试产物。模型服务应优先选择中国大陆网络可稳定访问的 endpoint；实际 provider 返回值必须经云函数 schema 校验，失败时只返回稳定错误。
5. 准备两个仅用于此环境的邮箱 A/B，并在每轮 smoke 前清空这两个账号的测试业务数据，包括 profile/goal、meals、weight、workouts、ai_analyses 和私有测试图片对象。邮箱和实时 OTP 只在 headed 浏览器中手动输入，不设置为环境变量。
6. 执行默认自动证据：

   ```bash
   CI=true pnpm lint
   CI=true pnpm typecheck
   CI=true pnpm test
   CI=true pnpm build
   CI=true pnpm preflight:cloudbase-manual
   CI=true pnpm test:e2e -- --project=mobile-chromium
   ```

   `pnpm preflight:cloudbase-manual` 只检查变量是否齐全、地域和模型配置是否合法、以及是否把服务端 secret 错放进 `VITE_*` 公开变量；它只输出变量名与 pass/fail，不输出实际 env id、key、endpoint 或 secret。

7. 显式启用人工 spec：

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

## 业务数据与云函数 smoke

真实环境 manual spec 通过后，继续用 A/B 测试账号做以下最小业务 smoke；所有记录只写 pass/fail 和脱敏摘要，建议直接使用 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md)。

1. A 保存目标、手动餐食、体重和训练；B 登录后不得看到 A 的任何业务数据。
2. A 上传一张专用测试餐食图片，触发 `mealPhotoAnalysis` 云函数；确认返回结果是“可编辑估算”，失败时只显示稳定错误，不暴露 provider detail、模型原文、照片对象 key 或签名 URL。
3. A 确认一条图片估算后，今日汇总增加；确认前今日汇总不变化；B 仍不可读 A 的 `ai_analyses` 或 `meals`。
4. 连续触发图片分析直到达到 `PHOTO_MEAL_DAILY_LIMIT`，确认限流以当前 `auth.uid()` 和日期计数，不影响 B。
5. A 进入 `/settings` 执行 `delete_my_application_data`，确认 A 的 profiles / nutrition_goals / meals / weight_entries / workouts / workout_exercises / workout_sets / ai_analyses 均不可读，B 数据不受影响。
6. 使用中国大陆网络 smoke 检查 `/`、`/onboarding`、`/today`、`/photo-meal`、`/trends`、`/settings` 的可访问性、PWA 更新/离线提示和性能预算；完整步骤见 [部署与上线验收](./deployment.md)。

## 已知 blocker 与负责人

当前仓库没有提供隔离环境 ID、Publishable Key、两个隔离邮箱、云函数服务端 `PHOTO_MEAL_*` secret、真实模型 endpoint、测试图片策略和实际大陆网络设备，因此真实 OTP、CAPTCHA/限流交互、CloudBase 双 session 并发、跨设备、真实视觉模型和中国大陆网络 smoke 仍为 `blocked`。负责人为仓库所有者；下一步是按本文档完成隔离环境配置，再运行 manual spec 和业务 smoke，并通过 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md) 记录不含真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文或 secret 的结果摘要。

如果同时要验收首版上线，请在 manual spec 通过后继续执行 `docs/operations/deployment.md` 的中国大陆网络 smoke 和性能预算检查；不要用本地 test-platform E2E 代替真实云环境结论。
