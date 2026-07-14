# 体重与训练 Task 3 迁移与隔离审阅

- Status: approved
- Workflow Stage: review
- Source Of Truth Until: Task 3 commit is created and Task 4 begins from `docs/superpowers/plans/2026-07-14-weight-workouts.md`
- Compounded Knowledge: not yet compounded

## 审阅范围

- `cloud/database/migrations/0003_weight_workouts.sql`
- `tests/security/pgliteAuthHarness.ts`
- `tests/security/weightWorkoutIsolation.test.ts`
- `tests/security/migrationShape.test.ts`

## 审阅结论

PASS。认可提交。

## 发现与处理

### Important：顶层 JSON object key 校验不严格

- 初审结论：FAIL。
- 问题：create/update weight/workout 顶层 payload 只检查 key 数量区间、必填 key 和少数敏感 key，允许 `foo` 这类未知字段借 optional `note` 的空位通过。
- 处理：为四个 payload 校验加入顶层 key allowlist；补充 create/update unknown extra key 回归测试，并验证无部分写入。
- 复审结论：PASS，阻断项已关闭。

### Minor：NULL 日期参数未显式按日期形状拒绝

- 处理：`list_my_weight_entries`、`list_my_workouts` 和 `copy_my_latest_workout` 显式拒绝 NULL 日期；`copy_my_latest_workout` 使用 `invalid workout date` 文案。
- 复审结论：PASS，Minor 已关闭。

## 已核对项

- 新表 `weight_entries`、`workouts`、`workout_exercises`、`workout_sets` 均为 user-owned，启用 RLS，拥有四类 own-row policy。
- 撤销 `PUBLIC`、`anon`、`authenticated` 直接表权限；仅 service_role 用于测试检查。
- RPC 均为 auth-only `SECURITY DEFINER`，固定 `search_path=pg_catalog, public, auth`，无 `user_id` 参数，内部使用 `auth.uid()`。
- 外键级联、completed-only volume、copy latest 生成新 id 的方向符合计划。

## 验证证据

- `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/weightWorkoutIsolation.test.ts tests/security/migrationShape.test.ts`：2 files / 19 tests passed
- `pnpm_config_verify_deps_before_run=warn pnpm typecheck`：passed
- `pnpm_config_verify_deps_before_run=warn pnpm lint`：passed
- `git diff --check`：passed
