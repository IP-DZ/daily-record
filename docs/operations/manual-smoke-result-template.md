# 真实 CloudBase Smoke 脱敏结果模板

> 复制本模板到你的验收记录中填写 pass、fail、blocked 和脱敏摘要。不得记录真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文、服务端 secret/key、CloudBase 环境 ID、公网 IP、完整请求体或完整响应体。提交或分享填写后的结果前，先运行 `pnpm validate:manual-smoke-result path/to/manual-smoke-result.md`；该校验只输出问题类型和行号，不回显敏感原文。

## 执行环境

- 日期：
- 执行人：
- Git commit：
- 部署版本：
- CloudBase 环境：隔离测试环境（不写环境 ID）
- 网络：大陆 4G/5G/宽带大类（不写公网 IP）
- 设备与浏览器：
- 测试账号：A/B 脱敏代号（不写邮箱）
- 测试图片策略：专用测试图片 / 临时拍摄图片（不写对象路径）

## Preflight

- `pnpm preflight:cloudbase-manual`：pass / fail / blocked
- `VITE_CLOUDBASE_*` 公开变量完整性：pass / fail / blocked
- `CLOUDBASE_*` 云函数变量完整性：pass / fail / blocked
- `PHOTO_MEAL_*` 模型变量完整性：pass / fail / blocked
- CloudBase 地域合法：pass / fail / blocked
- 模型 endpoint 为 HTTPS：pass / fail / blocked
- 命令输出未包含实际 key、endpoint、secret 或 token：pass / fail / blocked
- 备注（只写变量名、错误类型和下一步，不写变量值）：

## Manual Spec

- A 设备 1 邮箱 OTP 登录：pass / fail / blocked
- B 设备邮箱 OTP 登录：pass / fail / blocked
- A 设备 2 邮箱 OTP 登录：pass / fail / blocked
- A/B 本地 session 隔离：pass / fail / blocked
- A/B 目标与资料跨账号隔离：pass / fail / blocked
- A 跨设备资料同步：pass / fail / blocked
- 退出后刷新仍为登录页：pass / fail / blocked
- Playwright trace、screenshot、video 和 storageState 未保存敏感数据：pass / fail / blocked
- 备注（不写真实邮箱、验证码、session 或 token）：

## 业务 Smoke

- A 保存目标、手动餐食、体重、训练：pass / fail / blocked
- B 不可读取 A 的业务数据：pass / fail / blocked
- A 触发 `mealPhotoAnalysis` 并返回可编辑估算：pass / fail / blocked
- 图片分析失败时只显示稳定错误：pass / fail / blocked
- 确认图片估算后今日汇总变化，确认前不变化：pass / fail / blocked
- B 不可读取 A 的 `ai_analyses` 或 `meals`：pass / fail / blocked
- 每日限流按当前账号与日期生效：pass / fail / blocked
- 清空 A 应用数据后 A 业务数据不可读且 B 不受影响：pass / fail / blocked
- 备注（不写照片对象 key、签名 URL、模型响应原文或 provider 原始错误）：

## 中国大陆网络 Smoke

- `/` 与 `/onboarding` 首屏可访问：pass / fail / blocked
- `/today`、`/photo-meal`、`/trends`、`/settings` 可访问：pass / fail / blocked
- PWA 安装提示 / 更新提示：pass / fail / blocked
- 离线刷新只展示静态应用外壳或离线提示：pass / fail / blocked
- 私有图片、签名 URL 和账号 API 响应未被 service worker 缓存：pass / fail / blocked
- LCP 小于目标预算或已记录原因：pass / fail / blocked
- 包体预算小于目标或已记录原因：pass / fail / blocked
- 备注（只写耗时区间和体感，不写公网 IP 或私有资源地址）：

## 结果

- 总结：pass / fail / blocked
- 是否可发布：yes / no
- 必须修复项：
- 可延期项：
- 下一步：

## 阻塞项

| 项 | owner | next | 脱敏说明 |
| --- | --- | --- | --- |
|  |  |  | 只写缺失变量名、错误码或步骤名，不写真实邮箱、验证码、session、token、照片对象 key、签名 URL、模型响应原文、secret 或 key |
