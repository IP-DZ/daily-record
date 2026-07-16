# 部署与上线验收

本文档用于首版“每日记录”PWA 的部署与 smoke 验收。首发面向中国大陆网络环境，所有营养和拍照估算结果都必须作为可编辑估算呈现，不构成医疗建议。

## 发布前门禁

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test:cloud-functions
pnpm typecheck:cloud-functions
pnpm test
pnpm build
pnpm build:cloud-functions
pnpm smoke:cloud-functions
pnpm preflight:cloudbase-manual
pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts
pnpm test:e2e --project=mobile-chromium --reporter=line
```

`tests/security/buildArtifactSafety.test.ts` 需要在 `pnpm build` 后运行，扫描 `dist/`，确认正式产物没有服务端密钥标识、固定测试验证码、测试邮箱、`__daily-record-test-platform` endpoint 或 test-platform client 标记。真实 smoke 结果请复制 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md) 填写脱敏摘要，不要把敏感值写进仓库、日志或截图。

GitHub Actions 的 `.github/workflows/ci.yml` 会在 push 和 pull request 上运行不需要真实 CloudBase secret 的自动门禁：lint、typecheck、云函数 test/typecheck/build/smoke、单元与安全测试、production build、产物扫描和 test-platform 移动端 E2E。真实 `pnpm preflight:cloudbase-manual` 与 CloudBase manual smoke 需要隔离环境变量、测试邮箱和大陆网络设备，必须由发布人按本文档手动执行，不得在 CI 中放入服务端模型 secret。

## CloudBase 静态托管

1. 按 [CloudBase 隔离测试环境](./cloudbase-test-environment.md) 准备隔离环境，先完成迁移、RLS/RPC 验证和真实邮箱 OTP smoke。
2. 在 CI secret 或部署机器临时 shell 配置 `.env.example` 中列出的 `VITE_*` 公开变量。不要在仓库、构建日志或浏览器代码中写入服务端密钥、真实邮箱、验证码、模型密钥或 session。
3. 执行 `pnpm build` 生成 `dist/`。
4. 将 `dist/` 上传到 CloudBase 静态托管，入口回退到 `/index.html`，但不要把 `/api/*` 或 `/__*` endpoint 配成静态缓存。
5. 发布后使用无登录缓存的移动浏览器访问根路径、`/onboarding`、`/today`、`/settings`，确认 PWA 可安装、更新提示可见、账号接口正常走 CloudBase。

## CloudBase 云函数与模型变量

`cloud/functions/meal-photo-analysis` 提供可部署 `main` 入口和可注入 runtime factory。部署 `mealPhotoAnalysis` 云函数前，先执行 `pnpm typecheck:cloud-functions`、`pnpm build:cloud-functions` 和 `pnpm smoke:cloud-functions`，确认 `cloud/functions/meal-photo-analysis/dist/index.js` 与 `dist/package.json` 已生成且构建产物可导入、对象存储 adapter 不透传 `contentType`、云函数部署包不含 source map、浏览器 SDK、`window`/`document`、测试平台标记或 secret-like 字符串、`main` 可调用并在未认证请求上稳定返回 `unauthenticated`；部署包需要包含该函数目录的整个 `dist/`（包括 `package.json` ESM 元数据和 `@cloudbase/node-sdk` 服务端依赖声明）和函数级服务端配置，入口 handler 指向 `main`。部署时必须在 CloudBase 服务端环境或函数级 secret 中配置以下变量；这些变量不得写入 `.env.example`、浏览器代码、构建日志、Playwright trace、截图或提交历史。

```bash
CLOUDBASE_ENV_ID=<isolated-environment-id>
CLOUDBASE_PUBLISHABLE_KEY=<publishable-key>
CLOUDBASE_REGION=ap-shanghai
PHOTO_MEAL_MODEL_PROVIDER=http-json
PHOTO_MEAL_MODEL_ENDPOINT=<server-side-vision-model-endpoint>
PHOTO_MEAL_MODEL_NAME=<vision-model-name>
PHOTO_MEAL_MODEL_API_KEY=<server-side-secret>
PHOTO_MEAL_DAILY_LIMIT=20
```

- `PHOTO_MEAL_MODEL_PROVIDER` 首版仅支持 `http-json`，使用 OpenAI-compatible JSON chat/vision 请求体：`messages`、`image_url`、`response_format: { type: "json_object" }`。
- `PHOTO_MEAL_MODEL_ENDPOINT` 必须是服务端可访问的 HTTPS 地址；大陆网络首发应优先选择大陆可访问、延迟稳定的模型服务。
- `PHOTO_MEAL_MODEL_API_KEY` 只允许存在于云函数环境；仓库和前端构建产物只保存变量名，不保存值。
- `PHOTO_MEAL_DAILY_LIMIT` 默认 20，合法范围 1–100；真实环境调高前应先确认模型成本和限流策略。
- `CLOUDBASE_*` 只用于云函数初始化当前隔离环境；`CLOUDBASE_PUBLISHABLE_KEY` 是平台公开 key，不得替换成 TencentCloud SecretId / SecretKey 或数据库管理密钥。
- 云函数存储适配器必须把图片保存到 `users/{userHash}/photo-meal/{requestHash}/photo.webp|jpg` 形式的私有对象 key；对 `@cloudbase/node-sdk` 的上传调用只传 `cloudPath` 和 `fileContent`，不要依赖 SDK 未声明的 `contentType` 字段；不得使用 raw 用户 ID 作为路径段，不得生成长期公开 URL，也不得把 data URL、签名 URL、模型原文响应或密钥写入日志。
- 配置真实环境变量后先运行 `pnpm preflight:cloudbase-manual`；该命令会检查浏览器公开 `VITE_CLOUDBASE_*` 与云函数 `CLOUDBASE_*` 指向同一个隔离环境和地域，并且只输出变量名和检查结果，不输出实际 key、endpoint 或 secret。

## 自托管部署

1. 使用任意静态站点服务托管 `dist/`，开启 HTTPS、Brotli/gzip、长期 immutable cache 给带 hash 的 assets。
2. HTML、webmanifest 和 service worker 使用短缓存或 no-cache，避免用户长期停留旧壳。
3. SPA fallback 只回退真实页面路由；`/api/*`、`/__*`、私有图片签名 URL 和 CloudBase API 不得由静态服务或 service worker 缓存。
4. 若使用 CDN，确认中国大陆访问不会被跨境链路、DNS 或证书链拖慢；必要时选择大陆可访问的 CDN/对象存储。

## 中国大陆网络 smoke

每次正式发布至少用一台中国大陆网络下的移动设备执行：

1. 首屏打开 `/` 和 `/onboarding`，记录 4G/5G 或家庭宽带下的可交互体感。
2. 登录测试账号，保存目标、餐食、体重、训练，再进入 `/trends` 检查聚合趋势。
3. 打开 `/photo-meal`，上传一张测试餐食图，确认结果标记为可编辑估算，且没有暴露模型密钥或原始 provider 错误；只记录 pass/fail、耗时区间和用户是否手动修改估算，不记录照片对象 key 或模型响应原文。
4. 进入 `/settings`，只在隔离测试账号中验证“清空我的数据”，确认清空后业务数据不可读，登录身份仍可退出。
5. 断网刷新已访问过的页面，确认只看到静态应用外壳/离线提示；不得展示过期的私有餐食照片、签名 URL 或账号 API 响应。

执行结果统一按 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md) 记录，只写 pass/fail/blocked、耗时区间、错误码和下一步；不得记录真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文或 secret。将填写后的结果提交或分享前，先运行：

```bash
pnpm validate:manual-smoke-result path/to/manual-smoke-result.md
```

该校验会拦截真实邮箱、验证码、session/JWT、CloudBase 对象路径、签名 URL、secret-like 值、公网 IP 和 CloudBase 环境 ID；只输出问题类型和行号，不回显敏感原文。

## 性能预算

- LCP 预算：大陆移动网络首屏 LCP 目标小于 3.5s，超过 4.0s 必须记录原因和下一步。
- 包体预算：初始 JS gzip 目标小于 180 KB；超过 200 KB 需要拆包或说明原因。
- 图片预算：PWA icon 和静态图标保持压缩；用户上传餐食图片只在客户端压缩后提交，不进入静态构建产物。

## 真实 blocker

当前仓库已经提供本地可测的 `mealPhotoAnalysis` 云函数 handler、私有对象存储适配、auth-bound RPC 数据库网关和 `http-json` 模型 provider 适配；但仍无法自行完成真实 CloudBase、真实视觉模型和中国大陆网络 smoke，因为缺少隔离环境 ID、Publishable Key、服务端模型配置、两个测试邮箱和实际大陆网络设备。负责人为仓库所有者；下一步是提供隔离环境、云函数 secret 和测试账号后，按本文档、[本地开发文档](./local-development.md) 与 [`manual-smoke-result-template.md`](./manual-smoke-result-template.md) 记录不含邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文或 secret 的 pass/fail 摘要。
