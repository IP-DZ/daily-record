# 体重与训练 Task 1 合约与纯函数审阅

- Status: approved
- Workflow Stage: review
- Source Of Truth Until: Task 1 commit is created and Task 2 begins from `docs/superpowers/plans/2026-07-14-weight-workouts.md`
- Compounded Knowledge: not yet compounded

## 审阅范围

- `packages/contracts/src/contracts.test.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/weight.ts`
- `packages/contracts/src/workouts.ts`
- `packages/contracts/src/workouts.contracts.test.ts`
- `src/domain/weight/**`
- `src/domain/workouts/**`

## 审阅结论

PASS。认可提交。

## 发现

- Critical：无。
- Important：无。
- Minor：无。

## 已核对项

- 严格 Zod 合约覆盖体重日期格式、30..350kg、note <=500、训练日期、bodyParts 非空、duration 0..600/null、set weight/reps 非负与上限、未知 extra keys 拒绝。
- 体重反馈逻辑满足至少 8 条、跨度至少 21 天；按日期排序后使用前 7 条与后 7 条均值；目标周增重为 `currentWeightKg * 0.0025`；低/中/高区间映射到 `+100 / 0 / -100 kcal`；没有自动修改目标。
- 训练容量只统计 `completed` sets 的 `weightKg * reps`。
- 合约生产文件未依赖应用源；现有旧 type-only 兼容性测试引用应用层类型，本次新增实现未扩大该依赖。

## 验证证据

- `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/contracts.test.ts packages/contracts/src/workouts.contracts.test.ts src/domain/weight/weightFeedback.test.ts src/domain/workouts/workoutVolume.test.ts`：4 files / 58 tests passed
- `pnpm_config_verify_deps_before_run=warn pnpm typecheck`：passed
- `pnpm_config_verify_deps_before_run=warn pnpm lint`：passed
- `git diff --check`：passed
