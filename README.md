# Daily Record

面向中国大陆网络环境的个人饮食、体重与力量训练记录 PWA。

## 当前状态

首版本地实现、自动化验证、移动端 E2E、Anvil 审阅和 GitHub 推送已完成。当前分支：

- GitHub 分支：`feature/cloudbase-auth`
- Draft PR：[#2 实现个人饮食与训练记录 PWA](https://github.com/IP-DZ/daily-record/pull/2)
- 本地首版功能基线提交：`390ee524 test: add system hardening e2e`
- GitHub CI：`.github/workflows/ci.yml` 会在 push / pull request 上运行不需要真实 CloudBase secret 的自动门禁
- 主计划：[`docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md`](docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md)
- 系统加固计划：[`docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md`](docs/anvil/plans/2026-07-15-system-hardening-deployment-plan.md)

真实 CloudBase、真实视觉模型和中国大陆网络 smoke 仍需要仓库所有者提供隔离环境、云函数服务端模型 secret、测试邮箱和实际网络设备后执行；本仓库不会用本地 test platform 伪报真实云环境通过。

## 已实现能力

- 根据成年人身体资料估算增肌期热量与三大营养素目标，并允许手动调整。
- 记录每日餐次、食物、热量、碳水、蛋白质和脂肪。
- 上传饮食照片，经服务端云函数/视觉模型处理后生成可编辑营养估算；确认前不计入今日汇总。
- 记录体重、训练动作、组数、次数和重量，并查看营养、体重、训练与综合趋势。
- 使用邮箱验证码登录，通过 CloudBase 平台端口同步用户数据。
- 支持今日餐食、体重和训练表单的本地离线草稿恢复/丢弃。
- 提供隐私设置页，可清空当前账号在本应用内的业务数据。
- PWA 更新提示、离线提示、生产构建产物安全扫描和部署文档已补齐。

## 本地开发

环境要求：Node.js `^20.19.0` 或 `>=22.13.0`，pnpm `11.7.0`。

```bash
pnpm install
pnpm dev
```

详细说明见 [`docs/operations/local-development.md`](docs/operations/local-development.md)。

## 验证命令

本地首版最后一轮验证使用以下路径：

```bash
pnpm_config_verify_deps_before_run=warn pnpm lint
pnpm_config_verify_deps_before_run=warn pnpm typecheck
pnpm_config_verify_deps_before_run=warn pnpm test:cloud-functions
pnpm_config_verify_deps_before_run=warn pnpm typecheck:cloud-functions
pnpm_config_verify_deps_before_run=warn pnpm test
pnpm_config_verify_deps_before_run=warn pnpm build
pnpm_config_verify_deps_before_run=warn pnpm build:cloud-functions
pnpm_config_verify_deps_before_run=warn pnpm smoke:cloud-functions
pnpm_config_verify_deps_before_run=warn pnpm preflight:cloudbase-manual
pnpm_config_verify_deps_before_run=warn pnpm validate:manual-smoke-result docs/operations/manual-smoke-result-template.md
pnpm_config_verify_deps_before_run=warn pnpm validate:cloudbase-rpc-docs
pnpm_config_verify_deps_before_run=warn pnpm validate:cloudbase-env-docs
pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/buildArtifactSafety.test.ts
pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line
```

最近证据已写回 Anvil 计划：50 个 Vitest 文件通过（448 passed），production build 通过，云函数 package test/typecheck/build/smoke 通过并生成 `dist/package.json` ESM + `@cloudbase/node-sdk` 元数据；云函数已用显式对象存储 adapter 适配 Node SDK `uploadFile({ cloudPath, fileContent })` 调用，dist smoke 会实际验证 adapter 不透传 `contentType`，并扫描云函数部署包避免 source map、浏览器 SDK、测试标记或 secret-like 字符串混入，构建产物与 CI 工作流安全扫描 8/8，通过移动端 E2E 8 passed / 1 real CloudBase manual skipped。

## 技术栈

- React + TypeScript + Vite PWA
- 腾讯云 CloudBase：静态托管、邮箱认证、PostgreSQL、云函数和私有存储
- CloudBase 云函数处理图片餐食估算，服务端已提供 `http-json` / OpenAI-compatible 视觉模型 provider 适配接口

## 部署与真实 smoke

- 部署步骤：[`docs/operations/deployment.md`](docs/operations/deployment.md)
- CloudBase 隔离测试环境：[`docs/operations/cloudbase-test-environment.md`](docs/operations/cloudbase-test-environment.md)
- 真实 smoke 脱敏结果模板：[`docs/operations/manual-smoke-result-template.md`](docs/operations/manual-smoke-result-template.md)
- 环境变量样例：`.env.example`

真实 smoke 必须在隔离 CloudBase 环境、真实测试邮箱、服务端 `PHOTO_MEAL_*` 模型配置和中国大陆网络设备准备后执行。执行摘要请复制脱敏模板填写，不得记录真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文或 secret。

真实环境变量配置完成后，先运行 `pnpm preflight:cloudbase-manual`。该命令只输出变量名和检查结果，不输出实际 key、endpoint 或 secret。填写真实 smoke 结果后，先运行 `pnpm validate:manual-smoke-result path/to/manual-smoke-result.md`，确认记录中没有真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文、CloudBase 环境 ID、公网 IP 或 secret。

## 安全原则

- AI 识别结果必须由用户确认后才能计入营养汇总。
- 健康数据和饮食照片按账号隔离，并提供删除能力。
- 云平台与 AI 密钥只允许保存在服务端。
- 营养目标和图片结果均为估算，不构成医疗建议。
