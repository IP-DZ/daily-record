# 体重与训练 Task 5 训练页审阅

- Status: approved
- Workflow Stage: review
- Source Of Truth Until: Task 5 commit is created and Task 6 begins from `docs/superpowers/plans/2026-07-14-weight-workouts.md`
- Compounded Knowledge: not yet compounded

## 审阅范围

- `src/features/workouts/WorkoutsPage.test.tsx`
- `src/features/workouts/WorkoutsPage.tsx`
- `src/features/workouts/workouts.css`
- `src/features/workouts/index.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`

## 审阅结论

PASS。认可提交。

## 发现与处理

### Minor：复制测试未锁定目标日期和新 id

- 初审结论：With fixes。
- 问题：复制用例只断言训练卡片数量变为 2，未证明 `copyLatest` 使用选中日期，也未证明复制结果是新 workout id。
- 处理：补充测试，将日期切到 `2026-07-15` 后复制，断言复制结果 `workoutDate` 为目标日期、`id` 不等于原记录，并断言页面展示目标日期。
- 复审结论：PASS，Minor 已关闭。

## 已核对项

- `/workouts` route 在 `AuthGate` 后，未登录显示登录页，登录后使用注入的 `WorkoutsRepository`。
- 训练页支持日期、训练部位、时长、动作、重量、次数、完成状态保存。
- 训练容量展示调用 `calculateWorkoutVolume(workout)`，只统计已完成组，不盲信 repository 返回的 `volumeKg` 字段。
- 删除、复制上次训练的失败状态使用通用中文错误，并保留当前列表。
- 中文文案、移动优先 CSS、label/role 基础可访问性符合本轮要求。
- 未发现 CloudBase secret、AI secret、直接 SDK 调用、客户端 user id 注入或 provider 私密错误泄露。

## 验证证据

- `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/workouts/WorkoutsPage.test.tsx src/app/App.test.tsx`：2 files / 19 tests passed
- `pnpm_config_verify_deps_before_run=warn pnpm typecheck`：passed
- `pnpm_config_verify_deps_before_run=warn pnpm lint`：passed
- `git diff --check`：passed
