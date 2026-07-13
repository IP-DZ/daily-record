# 本地开发与移动端验收

## 开发

环境要求：Node.js `^20.19.0` 或 `>=22.12.0`、pnpm `11.7.0`，以及首次 E2E 验收所需的 Chromium。

```bash
pnpm install
pnpm dev
```

开发服务器启动后，访问终端显示的本地地址；引导页路径为 `/onboarding`。

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e -- --project=mobile-chromium
```

E2E 会先构建应用，再以 `127.0.0.1:4173` 启动严格端口的 Vite Preview。测试使用 390×844 的移动端视口，验证引导页计算及刷新后的本地草稿恢复。

## PWA 缓存边界

Service Worker 仅预缓存构建后的静态应用外壳，不配置接口或图片的运行时缓存。验证码、用户 API、签名 URL 和用户私有图片不得加入缓存。发现新版本时页面会显示更新提示，由用户点击后才刷新应用，避免静默中断正在填写的表单。
