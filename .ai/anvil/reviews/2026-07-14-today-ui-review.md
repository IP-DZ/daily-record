# 今日页与手动饮食闭环 Task 4 代码审阅

- Status: approved
- Workflow Stage: review
- Source Of Truth Until: Task 4 commit is created and Task 5 begins from the active Anvil plan
- Compounded Knowledge: not yet compounded

## 审阅范围

- `src/features/today/TodayPage.test.tsx`
- `src/features/today/TodayPage.tsx`
- `src/features/today/today.css`
- `src/features/today/index.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`

## 验证证据

- `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/today/TodayPage.test.tsx src/app/App.test.tsx`
  - 结果：2 files / 16 tests passed
- `pnpm_config_verify_deps_before_run=warn pnpm lint`
  - 结果：passed
- `pnpm_config_verify_deps_before_run=warn pnpm typecheck`
  - 结果：passed
- `git diff --check`
  - 结果：passed

## 发现与处理

### Important：编辑中切换日期可能把原餐食保存到错误日期

- 初审结论：FAIL，阻断提交。
- 根因：编辑态依赖当前列表中的 `editingMeal` 反推原始日期；切换日期后列表不再包含原餐食，保存时会 fallback 到当前选中日期。
- 处理：
  - 新增回归测试覆盖「编辑餐食后切换日期会退出编辑态并清空表单」。
  - 日期变更时调用 `resetForm()`，清除 `editingMealId` 和表单内容。
- 复审结论：PASS，阻断项已关闭。

### Minor：`formatNumber` 当前两分支等价

- 结论：非阻断。保留在后续 UI polish 中处理。

### Minor：操作成功但刷新失败时文案可更精细

- 结论：非阻断。当前仍保留列表、不暴露 provider 细节，满足本轮安全要求；后续可优化为更明确的局部状态文案。

## 审阅决定

PASS。认可提交 Task 4。
