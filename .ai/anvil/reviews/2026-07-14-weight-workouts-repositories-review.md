# 体重与训练 Task 2 仓储端口与平台适配审阅

- Status: approved
- Workflow Stage: review
- Source Of Truth Until: Task 2 commit is created and Task 3 begins from `docs/superpowers/plans/2026-07-14-weight-workouts.md`
- Compounded Knowledge: not yet compounded

## 审阅范围

- `src/platform/weight/**`
- `src/platform/workouts/**`
- `src/platform/testing/createTestPlatform.ts`
- `src/platform/testing/createTestPlatform.test.ts`
- `src/platform/cloudbase/CloudBaseWeightRepository.*`
- `src/platform/cloudbase/CloudBaseWorkoutsRepository.*`
- `src/platform/cloudbase/createCloudBasePlatform.ts`
- `src/platform/cloudbase/index.ts`

## 审阅结论

PASS。认可提交。

## 发现

- Critical：无。
- Important：无。
- Minor：`src/platform/cloudbase/index.ts` 初始未同步导出 `CloudBaseWeightRdbClient` / `CloudBaseWorkoutsRdbClient`，已补齐并复验通过。

## 已核对项

- `WeightRepository` / `WorkoutsRepository` 端口签名符合计划。
- `createTestPlatform` 的 weight/workouts 均通过 `requireCurrentUserId()` 获取当前登录用户，未登录拒绝；存储按 `userId` 分桶隔离。
- `workouts.copyLatest(targetDate)` 会生成新的 workout/exercise/set id，保留 exercise/set 顺序，`volumeKg` 通过 `calculateWorkoutVolume` 只统计 completed sets。
- CloudBase adapters 只调用固定 RPC；payload 经过 Zod 校验；未携带 user id/email；provider error、无效返回数据、provider reject 都映射为稳定安全 repository error，不泄露 provider message。
- `createCloudBasePlatform` 可通过 direct access 访问 `weight` / `workouts`；保持非枚举属于兼容性选择。

## 验证证据

- `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBaseWeightRepository.test.ts src/platform/cloudbase/CloudBaseWorkoutsRepository.test.ts src/platform/cloudbase/createCloudBasePlatform.test.ts`：4 files / 15 tests passed
- `pnpm_config_verify_deps_before_run=warn pnpm typecheck`：passed
- `pnpm_config_verify_deps_before_run=warn pnpm lint`：passed（审阅前）
- `git diff --check`：passed
