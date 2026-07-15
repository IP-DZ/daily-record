# 部署与上线验收

本文档用于首版“每日记录”PWA 的部署与 smoke 验收。首发面向中国大陆网络环境，所有营养和拍照估算结果都必须作为可编辑估算呈现，不构成医疗建议。

## 发布前门禁

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts
pnpm test:e2e --project=mobile-chromium --reporter=line
```

`tests/security/buildArtifactSafety.test.ts` 需要在 `pnpm build` 后运行，扫描 `dist/`，确认正式产物没有服务端密钥标识、固定测试验证码、测试邮箱、`__daily-record-test-platform` endpoint 或 test-platform client 标记。

## CloudBase 静态托管

1. 按 [CloudBase 隔离测试环境](./cloudbase-test-environment.md) 准备隔离环境，先完成迁移、RLS/RPC 验证和真实邮箱 OTP smoke。
2. 在 CI secret 或部署机器临时 shell 配置 `.env.example` 中列出的 `VITE_*` 公开变量。不要在仓库、构建日志或浏览器代码中写入服务端密钥、真实邮箱、验证码、模型密钥或 session。
3. 执行 `pnpm build` 生成 `dist/`。
4. 将 `dist/` 上传到 CloudBase 静态托管，入口回退到 `/index.html`，但不要把 `/api/*` 或 `/__*` endpoint 配成静态缓存。
5. 发布后使用无登录缓存的移动浏览器访问根路径、`/onboarding`、`/today`、`/settings`，确认 PWA 可安装、更新提示可见、账号接口正常走 CloudBase。

## 自托管部署

1. 使用任意静态站点服务托管 `dist/`，开启 HTTPS、Brotli/gzip、长期 immutable cache 给带 hash 的 assets。
2. HTML、webmanifest 和 service worker 使用短缓存或 no-cache，避免用户长期停留旧壳。
3. SPA fallback 只回退真实页面路由；`/api/*`、`/__*`、私有图片签名 URL 和 CloudBase API 不得由静态服务或 service worker 缓存。
4. 若使用 CDN，确认中国大陆访问不会被跨境链路、DNS 或证书链拖慢；必要时选择大陆可访问的 CDN/对象存储。

## 中国大陆网络 smoke

每次正式发布至少用一台中国大陆网络下的移动设备执行：

1. 首屏打开 `/` 和 `/onboarding`，记录 4G/5G 或家庭宽带下的可交互体感。
2. 登录测试账号，保存目标、餐食、体重、训练，再进入 `/trends` 检查聚合趋势。
3. 打开 `/photo-meal`，上传一张测试餐食图，确认结果标记为可编辑估算，且没有暴露模型密钥或原始 provider 错误。
4. 进入 `/settings`，只在隔离测试账号中验证“清空我的数据”，确认清空后业务数据不可读，登录身份仍可退出。
5. 断网刷新已访问过的页面，确认只看到静态应用外壳/离线提示；不得展示过期的私有餐食照片、签名 URL 或账号 API 响应。

## 性能预算

- LCP 预算：大陆移动网络首屏 LCP 目标小于 3.5s，超过 4.0s 必须记录原因和下一步。
- 包体预算：初始 JS gzip 目标小于 180 KB；超过 200 KB 需要拆包或说明原因。
- 图片预算：PWA icon 和静态图标保持压缩；用户上传餐食图片只在客户端压缩后提交，不进入静态构建产物。

## 真实 blocker

当前仓库无法自行完成真实 CloudBase、真实视觉模型和中国大陆网络 smoke，因为缺少隔离环境 ID、Publishable Key、服务端模型配置、两个测试邮箱和实际大陆网络设备。负责人为仓库所有者；下一步是提供隔离环境和测试账号后，按本文档与 [本地开发文档](./local-development.md) 记录不含邮箱、验证码、session、token、照片对象 key 或模型响应原文的 pass/fail 摘要。
