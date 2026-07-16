# Manual Meals Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the non-AI food logging MVP: today page, manual meal CRUD, copy, per-day query, and exact calorie/macro summary.

**Architecture:** Add meal contracts first, then a pure domain summary, then platform repositories backed by local test memory and CloudBase RPCs. The UI consumes only a `MealsRepository` port and `ProfileSettingsRepository`; CloudBase SDK remains isolated under `src/platform/cloudbase`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright mobile Chromium, Zod contracts, CloudBase RDB RPC, PGlite security tests.

## Global Constraints

- Product language and project documentation default to Chinese.
- First release targets adults using mainland China networks.
- Nutrition and meal estimates are editable estimates, not medical advice.
- Never expose cloud or AI secret keys in browser code.
- Every user-owned table must enforce per-user access control.
- Task 3 ownership: `src/features/today/**`, `src/features/meals/**`, `src/domain/meals/**`, `cloud/functions/meals/**`, meal migration/tests, and required public port wiring.
- Success criteria: meal changes make daily summary exactly equal item sums; failed transactions leave summaries unchanged; mobile E2E can add and delete a manual meal.

---

## File Structure

- `packages/contracts/src/meals.ts`: Zod schemas and DTO types for meal items, create/update commands, day query results, and nutrition totals.
- `src/domain/meals/summarizeMeals.ts`: pure summation and rounding-free total calculation.
- `src/platform/meals/MealsRepository.ts`: browser-facing port.
- `src/platform/cloudbase/CloudBaseMealsRepository.ts`: CloudBase RPC adapter.
- `src/platform/testing/createTestPlatform.ts`: in-memory meals implementation for E2E.
- `cloud/database/migrations/0002_meals.sql`: `meals` table, RLS, auth-only RPCs.
- `tests/security/mealIsolation.test.ts`: PGlite production-migration tests for per-user CRUD and rollback behavior.
- `src/features/today/TodayPage.tsx`: today's manual meal workflow.
- `src/features/today/today.css`: compact mobile-first tool UI.
- `tests/e2e/manual-meals.spec.ts`: add/delete meal mobile E2E.
- `src/app/App.tsx`: route `/today` to `TodayPage` behind the same auth/platform boundary.

## Task 1: Meal Contracts And Domain Summary

**Files:**
- Create: `packages/contracts/src/meals.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `src/domain/meals/summarizeMeals.test.ts`
- Create: `src/domain/meals/summarizeMeals.ts`
- Create: `src/domain/meals/index.ts`

**Interfaces:**
- Produces:
  - `MealNutritionTotals = { caloriesKcal: number; proteinGrams: number; fatGrams: number; carbsGrams: number }`
  - `MealEntry = { id: string; mealDate: string; name: string; amount: string; nutrition: MealNutritionTotals; createdAt: string; updatedAt: string }`
  - `CreateMealInput = { mealDate: string; name: string; amount: string; nutrition: MealNutritionTotals }`
  - `UpdateMealInput = { id: string; mealDate: string; name: string; amount: string; nutrition: MealNutritionTotals }`
  - `summarizeMeals(meals: readonly Pick<MealEntry, 'nutrition'>[]): MealNutritionTotals`

- [ ] **Step 1: Write failing contract and domain tests**

Add tests that expect:

```ts
expect(summarizeMeals([
  { nutrition: { caloriesKcal: 600.5, proteinGrams: 35.2, fatGrams: 18, carbsGrams: 72.3 } },
  { nutrition: { caloriesKcal: 260, proteinGrams: 12, fatGrams: 9.5, carbsGrams: 28 } },
])).toEqual({ caloriesKcal: 860.5, proteinGrams: 47.2, fatGrams: 27.5, carbsGrams: 100.3 });
```

Also assert Zod rejects negative nutrition numbers, empty meal name, invalid `YYYY-MM-DD`, and unknown extra keys.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/contracts.test.ts src/domain/meals/summarizeMeals.test.ts`

Expected: fail because `meals.ts` and `summarizeMeals` do not exist.

- [ ] **Step 3: Implement contracts and pure summary**

Use strict Zod objects. Date format is `/^\d{4}-\d{2}-\d{2}$/`; name length `1..80`; amount length `1..80`; nutrition fields are `finite().nonnegative()`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/contracts.test.ts src/domain/meals/summarizeMeals.test.ts`

Expected: all selected tests pass.

## Task 2: Meal Repository Port, Test Platform, And CloudBase Adapter

**Files:**
- Create: `src/platform/meals/MealsRepository.ts`
- Create: `src/platform/meals/index.ts`
- Modify: `src/platform/testing/createTestPlatform.ts`
- Test: `src/platform/testing/createTestPlatform.test.ts`
- Create: `src/platform/cloudbase/CloudBaseMealsRepository.test.ts`
- Create: `src/platform/cloudbase/CloudBaseMealsRepository.ts`
- Modify: `src/platform/cloudbase/createCloudBasePlatform.ts`
- Modify: `src/platform/cloudbase/index.ts`

**Interfaces:**
- Consumes Task 1 contracts.
- Produces:
  - `MealsRepository.listByDate(mealDate: string): Promise<{ meals: MealEntry[]; totals: MealNutritionTotals }>`
  - `MealsRepository.create(input: CreateMealInput): Promise<MealEntry>`
  - `MealsRepository.update(input: UpdateMealInput): Promise<MealEntry>`
  - `MealsRepository.delete(id: string): Promise<void>`
  - `MealsRepository.copy(id: string, mealDate: string): Promise<MealEntry>`

- [ ] **Step 1: Write failing repository tests**

Test the in-memory platform creates two meals for user A, creates one for user B, keeps the two users isolated, copies a meal to the same day with a new id, and recalculates totals after delete.

Test CloudBase adapter calls RPCs named `list_my_meals_by_date`, `create_my_meal`, `update_my_meal`, `delete_my_meal`, `copy_my_meal`, parses returned payloads, and maps any provider error to `MealsRepositoryError`.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBaseMealsRepository.test.ts`

Expected: fail because the meals repository port and adapters do not exist.

- [ ] **Step 3: Implement minimal repositories**

In the test platform, store meals by authenticated `userId`; reject calls when no user is signed in. In CloudBase, send only validated command payloads to RPC and never include user id from the client.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBaseMealsRepository.test.ts`

Expected: selected tests pass.

## Task 3: Production Meal Migration And Isolation Tests

**Files:**
- Create: `cloud/database/migrations/0002_meals.sql`
- Modify: `tests/security/pgliteAuthHarness.ts`
- Create: `tests/security/mealIsolation.test.ts`
- Modify: `tests/security/migrationShape.test.ts`

**Interfaces:**
- Produces production RPCs matching Task 2 adapter:
  - `public.list_my_meals_by_date(meal_date text) returns jsonb`
  - `public.create_my_meal(payload jsonb) returns jsonb`
  - `public.update_my_meal(payload jsonb) returns jsonb`
  - `public.delete_my_meal(meal_id uuid) returns void`
  - `public.copy_my_meal(meal_id uuid, target_meal_date text) returns jsonb`

- [ ] **Step 1: Write failing PGlite security tests**

Assert:

```sql
SELECT public.create_my_meal('{"mealDate":"2026-07-14","name":"鸡胸饭","amount":"1份","nutrition":{"caloriesKcal":620,"proteinGrams":42,"fatGrams":16,"carbsGrams":78}}'::jsonb)
```

creates one row for user A, user B cannot list/delete it, deleting a missing or foreign meal raises a stable error, and invalid negative nutrition leaves the table count unchanged.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/mealIsolation.test.ts tests/security/migrationShape.test.ts`

Expected: fail because migration `0002_meals.sql` does not exist and harness only applies migration 0001.

- [ ] **Step 3: Implement migration and harness application**

Create `public.meals` with `user_id text not null`, `meal_date date not null`, `name text not null`, `amount text not null`, four numeric nutrition columns, timestamps, RLS enabled, own-row policies, no direct anon/authenticated table privileges, and auth-only fixed-search-path definer RPCs. Validate strict JSON keys, non-empty strings, date format, nonnegative finite-equivalent numeric values, and no user-supplied `user_id`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/mealIsolation.test.ts tests/security/migrationShape.test.ts`

Expected: selected tests pass.

## Task 4: Today Page UI And App Wiring

**Files:**
- Create: `src/features/today/TodayPage.test.tsx`
- Create: `src/features/today/TodayPage.tsx`
- Create: `src/features/today/today.css`
- Create: `src/features/today/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes `MealsRepository` and `ProfileSettingsRepository`.
- Produces route `/today` where an authenticated user can choose date, add manual meals, see exact totals, copy, edit, and delete.

- [ ] **Step 1: Write failing component tests**

Render `TodayPage` with an in-memory `MealsRepository`. Assert it:

```ts
await user.type(screen.getByLabelText('餐食名称'), '鸡胸饭');
await user.type(screen.getByLabelText('份量'), '1份');
await user.type(screen.getByLabelText('热量'), '620');
await user.type(screen.getByLabelText('蛋白质'), '42');
await user.type(screen.getByLabelText('脂肪'), '16');
await user.type(screen.getByLabelText('碳水'), '78');
await user.click(screen.getByRole('button', { name: '保存餐食' }));
expect(await screen.findByText('总热量 620 kcal')).toBeInTheDocument();
```

Also assert delete returns totals to zero and repository failure keeps the previous rendered meal list.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/today/TodayPage.test.tsx src/app/App.test.tsx`

Expected: fail because `TodayPage` is not implemented.

- [ ] **Step 3: Implement UI and route**

Use a compact mobile-first layout. Do not add a marketing page. Use native date and number inputs, explicit labels, status messages, and one-card-per-meal list items. If no meals exist, show a quiet empty state and keep the add form primary.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/today/TodayPage.test.tsx src/app/App.test.tsx`

Expected: selected tests pass.

## Task 5: Mobile E2E, Status, And Review Prep

**Files:**
- Create: `tests/e2e/manual-meals.spec.ts`
- Modify: `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md`

**Interfaces:**
- Consumes route `/today?test-platform=1`.
- Produces task 3 evidence in the Anvil plan.

- [ ] **Step 1: Write failing E2E**

Use the test platform route. Log in via OTP, go to `/today?test-platform=1`, create a meal, assert the meal and totals appear, delete it, assert empty state and zero totals return.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm test:e2e -- --project=mobile-chromium --reporter=line`

Expected before UI wiring: manual meal test fails.

- [ ] **Step 3: Update plan status**

In the Anvil main plan, set Task 3 `Code Status`, `Actual Write Set`, `Verification`, and `Evidence`; leave real CloudBase smoke marked blocked until isolated environment is configured.

- [ ] **Step 4: Full verification**

Run:

```bash
pnpm_config_verify_deps_before_run=warn pnpm lint
pnpm_config_verify_deps_before_run=warn pnpm typecheck
pnpm_config_verify_deps_before_run=warn pnpm test
pnpm_config_verify_deps_before_run=warn pnpm build
pnpm_config_verify_deps_before_run=warn pnpm test:e2e -- --project=mobile-chromium --reporter=line
git diff --check
```

Expected: all automated checks pass except real CloudBase manual spec remains skipped.

## Self-Review

- Spec coverage: manual add/edit/copy/delete, per-day query, exact totals, transaction rollback, mobile E2E, and per-user isolation each map to Tasks 1-5.
- Placeholder scan: no `TBD`, `TODO`, or unspecified "handle edge cases" steps remain.
- Type consistency: repository method names match CloudBase RPC adapter, test platform, UI, and migration tasks.
