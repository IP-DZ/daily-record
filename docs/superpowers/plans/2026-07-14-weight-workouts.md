# Weight And Workouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next local MVP slice: authenticated users can record body weight, get the 21-day calorie feedback estimate, record strength workouts, copy the latest workout, and verify both flows on mobile.

**Architecture:** Follow the Task 3 pattern: shared Zod contracts first, pure domain functions second, platform repository ports third, then CloudBase RPC adapters plus the in-memory test platform. React pages depend only on repository ports; CloudBase SDK and raw RPC names stay under `src/platform/cloudbase`. Production storage uses Postgres tables with no direct `authenticated` table privileges and fixed-search-path `SECURITY DEFINER` RPCs bound to `auth.uid()`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Playwright mobile Chromium, Zod contracts, CloudBase PostgreSQL RPC, PGlite security tests.

## Global Constraints

- Product language and project documentation default to Chinese.
- First release targets adults using mainland China networks.
- Nutrition and body-weight feedback are editable estimates, not medical advice.
- Never expose cloud or AI secret keys in browser code.
- Every user-owned table must enforce per-user access control.
- Weight feedback must not automatically modify nutrition targets.
- Workout volume counts only completed sets and uses `weightKg * reps`.
- UI uses direct routes `/weight` and `/workouts` behind the same `AuthGate`; bottom navigation polish remains for the later app-shell task unless required by tests.
- Real CloudBase smoke remains blocked until the isolated environment in `docs/operations/cloudbase-test-environment.md` is configured.

---

## File Structure

- `packages/contracts/src/weight.ts`: weight entry DTOs and strict Zod schemas.
- `packages/contracts/src/workouts.ts`: workout session, exercise, set DTOs and strict Zod schemas.
- `src/domain/weight/weightFeedback.ts`: 7-day average and 21-day calorie adjustment suggestion.
- `src/domain/workouts/workoutVolume.ts`: completed-set volume calculation and copy-normalization helpers.
- `src/platform/weight/WeightRepository.ts`: browser-facing weight port.
- `src/platform/workouts/WorkoutsRepository.ts`: browser-facing workouts port.
- `src/platform/cloudbase/CloudBaseWeightRepository.ts`: CloudBase RPC adapter for weight entries.
- `src/platform/cloudbase/CloudBaseWorkoutsRepository.ts`: CloudBase RPC adapter for workout sessions.
- `cloud/database/migrations/0003_weight_workouts.sql`: `weight_entries`, `workouts`, `workout_exercises`, `workout_sets`, RLS and RPCs.
- `tests/security/weightWorkoutIsolation.test.ts`: PGlite production migration tests for user isolation and rollback.
- `src/features/weight/WeightPage.tsx`: mobile-first weight form, list, 7-day average and feedback.
- `src/features/workouts/WorkoutsPage.tsx`: mobile-first workout form, list, completed-set volume and copy latest.
- `tests/e2e/weight-workouts.spec.ts`: mobile test-platform flow for weight and workout records.
- `src/app/App.tsx`: authenticated routes `/weight` and `/workouts`.

## Task 1: Weight And Workout Contracts Plus Pure Domain

**Files:**
- Create: `packages/contracts/src/weight.ts`
- Create: `packages/contracts/src/workouts.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `src/domain/weight/weightFeedback.test.ts`
- Create: `src/domain/weight/weightFeedback.ts`
- Create: `src/domain/weight/index.ts`
- Create: `src/domain/workouts/workoutVolume.test.ts`
- Create: `src/domain/workouts/workoutVolume.ts`
- Create: `src/domain/workouts/index.ts`

**Interfaces:**
- Produces:
  - `WeightEntry = { id: string; entryDate: string; weightKg: number; note: string; createdAt: string; updatedAt: string }`
  - `CreateWeightEntryInput = { entryDate: string; weightKg: number; note?: string }`
  - `UpdateWeightEntryInput = { id: string; entryDate: string; weightKg: number; note?: string }`
  - `WeightFeedback = { status: 'insufficient-data' | 'increase-calories' | 'decrease-calories' | 'maintain'; deltaCaloriesKcal: -100 | 0 | 100; weeklyChangeKg: number | null; targetWeeklyGainKg: number }`
  - `calculateWeightFeedback(entries: readonly WeightEntry[], currentWeightKg: number): WeightFeedback`
  - `WorkoutSession`, `WorkoutExercise`, `WorkoutSet`, `CreateWorkoutInput`, `UpdateWorkoutInput`
  - `calculateWorkoutVolume(session: Pick<WorkoutSession, 'exercises'>): number`

- [ ] **Step 1: Write failing contract and domain tests**

Add tests that expect:

```ts
expect(calculateWeightFeedback([
  { entryDate: '2026-07-01', weightKg: 70, id: 'w1', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-02', weightKg: 70.1, id: 'w2', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-03', weightKg: 70.1, id: 'w3', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-04', weightKg: 70.2, id: 'w4', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-05', weightKg: 70.2, id: 'w5', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-06', weightKg: 70.3, id: 'w6', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-07', weightKg: 70.3, id: 'w7', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-22', weightKg: 70.2, id: 'w8', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-23', weightKg: 70.2, id: 'w9', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-24', weightKg: 70.3, id: 'w10', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-25', weightKg: 70.3, id: 'w11', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-26', weightKg: 70.4, id: 'w12', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-27', weightKg: 70.4, id: 'w13', note: '', createdAt: 't', updatedAt: 't' },
  { entryDate: '2026-07-28', weightKg: 70.5, id: 'w14', note: '', createdAt: 't', updatedAt: 't' },
], 70)).toMatchObject({
  status: 'increase-calories',
  deltaCaloriesKcal: 100,
  targetWeeklyGainKg: 0.175,
});
```

Also assert fewer than 8 entries returns `insufficient-data`; fast gain above 150% target returns `decrease-calories`; middle range returns `maintain`; Zod rejects invalid dates, negative weights, empty workout body parts, negative set weights/reps, and unknown extra keys.

For workouts:

```ts
expect(calculateWorkoutVolume({
  exercises: [{
    id: 'e1',
    name: '卧推',
    order: 1,
    sets: [
      { id: 's1', order: 1, weightKg: 60, reps: 8, completed: true },
      { id: 's2', order: 2, weightKg: 60, reps: 8, completed: false },
    ],
  }],
})).toBe(480);
```

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/contracts.test.ts src/domain/weight/weightFeedback.test.ts src/domain/workouts/workoutVolume.test.ts`

Expected: fail because `weight.ts`, `workouts.ts`, and the domain modules do not exist.

- [ ] **Step 3: Implement contracts and pure functions**

Use strict Zod objects. Date format is `/^\d{4}-\d{2}-\d{2}$/`; weight range is `30..350`; notes max 500 chars; workout name/body part max 80 chars; duration is integer `0..600` or `null`; set weight is `0..1000`; reps is integer `0..1000`. `calculateWeightFeedback` sorts by `entryDate`, uses the first 7 chronological entries and last 7 chronological entries only when the date span is at least 21 days and total entries are at least 8. Target weekly gain is `currentWeightKg * 0.0025`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run packages/contracts/src/contracts.test.ts src/domain/weight/weightFeedback.test.ts src/domain/workouts/workoutVolume.test.ts`

Expected: all selected tests pass.

## Task 2: Weight And Workout Repositories

**Files:**
- Create: `src/platform/weight/WeightRepository.ts`
- Create: `src/platform/weight/index.ts`
- Create: `src/platform/workouts/WorkoutsRepository.ts`
- Create: `src/platform/workouts/index.ts`
- Modify: `src/platform/testing/createTestPlatform.ts`
- Modify: `src/platform/testing/createTestPlatform.test.ts`
- Create: `src/platform/cloudbase/CloudBaseWeightRepository.test.ts`
- Create: `src/platform/cloudbase/CloudBaseWeightRepository.ts`
- Create: `src/platform/cloudbase/CloudBaseWorkoutsRepository.test.ts`
- Create: `src/platform/cloudbase/CloudBaseWorkoutsRepository.ts`
- Modify: `src/platform/cloudbase/createCloudBasePlatform.ts`
- Modify: `src/platform/cloudbase/index.ts`

**Interfaces:**
- Consumes Task 1 contracts and pure functions.
- Produces:
  - `WeightRepository.listByDateRange(startDate: string, endDate: string): Promise<WeightEntry[]>`
  - `WeightRepository.create(input: CreateWeightEntryInput): Promise<WeightEntry>`
  - `WeightRepository.update(input: UpdateWeightEntryInput): Promise<WeightEntry>`
  - `WeightRepository.delete(id: string): Promise<void>`
  - `WorkoutsRepository.listByDateRange(startDate: string, endDate: string): Promise<WorkoutSession[]>`
  - `WorkoutsRepository.create(input: CreateWorkoutInput): Promise<WorkoutSession>`
  - `WorkoutsRepository.update(input: UpdateWorkoutInput): Promise<WorkoutSession>`
  - `WorkoutsRepository.delete(id: string): Promise<void>`
  - `WorkoutsRepository.copyLatest(targetDate: string): Promise<WorkoutSession>`

- [ ] **Step 1: Write failing repository tests**

Test the in-memory platform:

```ts
const platformA = createTestPlatform(fetcherForUser('user-a'));
const platformB = createTestPlatform(fetcherForUser('user-b'));
await platformA.weight.create({ entryDate: '2026-07-14', weightKg: 70, note: '晨重' });
await platformB.weight.create({ entryDate: '2026-07-14', weightKg: 80, note: '' });
await expect(platformA.weight.listByDateRange('2026-07-01', '2026-07-31')).resolves.toHaveLength(1);
await expect(platformB.weight.listByDateRange('2026-07-01', '2026-07-31')).resolves.toHaveLength(1);
```

Test workouts create/list/delete and `copyLatest('2026-07-15')` keeps exercise/set order but creates new workout, exercise and set ids.

Test CloudBase adapters call RPCs named:

- `list_my_weight_entries`
- `create_my_weight_entry`
- `update_my_weight_entry`
- `delete_my_weight_entry`
- `list_my_workouts`
- `create_my_workout`
- `update_my_workout`
- `delete_my_workout`
- `copy_my_latest_workout`

Adapter tests must verify provider errors map to `WeightRepositoryError` / `WorkoutsRepositoryError` without leaking provider messages.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBaseWeightRepository.test.ts src/platform/cloudbase/CloudBaseWorkoutsRepository.test.ts`

Expected: fail because repositories and adapters do not exist.

- [ ] **Step 3: Implement minimal repositories**

In the test platform, store `weight` and `workouts` by authenticated `userId`; reject calls when no user is signed in. CloudBase adapters send only validated command payloads to RPC and never include user id from the client. Like `meals`, expose new platform members as direct properties; if existing compatibility tests rely on object enumeration, keep compatibility with non-enumerable properties and direct typed access.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/platform/testing/createTestPlatform.test.ts src/platform/cloudbase/CloudBaseWeightRepository.test.ts src/platform/cloudbase/CloudBaseWorkoutsRepository.test.ts`

Expected: selected tests pass.

## Task 3: Production Migration And Isolation Tests

**Files:**
- Create: `cloud/database/migrations/0003_weight_workouts.sql`
- Modify: `tests/security/pgliteAuthHarness.ts`
- Create: `tests/security/weightWorkoutIsolation.test.ts`
- Modify: `tests/security/migrationShape.test.ts`

**Interfaces:**
- Produces production RPCs matching Task 2 adapters:
  - `public.list_my_weight_entries(start_date text, end_date text) returns jsonb`
  - `public.create_my_weight_entry(payload jsonb) returns jsonb`
  - `public.update_my_weight_entry(payload jsonb) returns jsonb`
  - `public.delete_my_weight_entry(entry_id uuid) returns void`
  - `public.list_my_workouts(start_date text, end_date text) returns jsonb`
  - `public.create_my_workout(payload jsonb) returns jsonb`
  - `public.update_my_workout(payload jsonb) returns jsonb`
  - `public.delete_my_workout(workout_id uuid) returns void`
  - `public.copy_my_latest_workout(target_workout_date text) returns jsonb`

- [ ] **Step 1: Write failing PGlite security tests**

Assert user A can create weight and workout rows, user B cannot list/delete them, invalid negative weights/sets leave row counts unchanged, and `copy_my_latest_workout` copies only the latest workout before or on the source date while generating new ids.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/weightWorkoutIsolation.test.ts tests/security/migrationShape.test.ts`

Expected: fail because migration `0003_weight_workouts.sql` does not exist and the harness only applies migrations 0001 and 0002.

- [ ] **Step 3: Implement migration and harness application**

Create tables:

- `public.weight_entries(id uuid primary key, user_id text not null default auth.uid(), entry_date date not null, weight_kg numeric not null, note text not null default '', created_at timestamptz, updated_at timestamptz)`
- `public.workouts(id uuid primary key, user_id text not null default auth.uid(), workout_date date not null, body_parts text[] not null, duration_minutes integer, note text not null default '', created_at timestamptz, updated_at timestamptz)`
- `public.workout_exercises(id uuid primary key, workout_id uuid references workouts(id) on delete cascade, user_id text not null default auth.uid(), exercise_order integer not null, name text not null)`
- `public.workout_sets(id uuid primary key, exercise_id uuid references workout_exercises(id) on delete cascade, user_id text not null default auth.uid(), set_order integer not null, weight_kg numeric not null, reps integer not null, completed boolean not null)`

Enable RLS for all tables, add own-row policies, revoke direct table privileges from `PUBLIC`, `anon`, and `authenticated`, grant service-role table privileges, and expose auth-only fixed-search-path definer RPCs. Validate strict JSON keys, date format, non-empty body parts/exercise names, range constraints, and no user-supplied `user_id`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run tests/security/weightWorkoutIsolation.test.ts tests/security/migrationShape.test.ts`

Expected: selected tests pass.

## Task 4: Weight Page UI And App Wiring

**Files:**
- Create: `src/features/weight/WeightPage.test.tsx`
- Create: `src/features/weight/WeightPage.tsx`
- Create: `src/features/weight/weight.css`
- Create: `src/features/weight/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes `WeightRepository` and `calculateWeightFeedback`.
- Produces route `/weight` where an authenticated user can choose date, add/update/delete weight entries, view recent entries, 7-day average and 21-day ±100 kcal suggestion.

- [ ] **Step 1: Write failing component tests**

Render `WeightPage` with an in-memory `WeightRepository`. Assert it:

```ts
await user.type(screen.getByLabelText('体重（千克）'), '70.4');
await user.type(screen.getByLabelText('备注'), '晨重');
await user.click(screen.getByRole('button', { name: '保存体重' }));
expect(await screen.findByRole('heading', { name: '70.4 kg' })).toBeInTheDocument();
```

Also assert deleting an entry removes it, fewer than 8 records shows `数据还不够，先继续记录。`, and a 21-day slow-gain fixture shows `建议每日增加 100 kcal` without changing nutrition targets.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/weight/WeightPage.test.tsx src/app/App.test.tsx`

Expected: fail because `WeightPage` is not implemented.

- [ ] **Step 3: Implement UI and route**

Use native date and number inputs, Chinese labels, explicit status messages, and a compact card list. If a repository operation fails, show a generic Chinese error and keep the previous rendered list. `/weight` must use `AuthGate`; unauthenticated users see the login page, and missing config shows a recoverable auth-loading style notice.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/weight/WeightPage.test.tsx src/app/App.test.tsx`

Expected: selected tests pass.

## Task 5: Workouts Page UI And App Wiring

**Files:**
- Create: `src/features/workouts/WorkoutsPage.test.tsx`
- Create: `src/features/workouts/WorkoutsPage.tsx`
- Create: `src/features/workouts/workouts.css`
- Create: `src/features/workouts/index.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes `WorkoutsRepository` and `calculateWorkoutVolume`.
- Produces route `/workouts` where an authenticated user can create a workout with body part, duration, one or more exercises and sets; view completed-set volume; delete sessions; copy the latest workout to the selected date.

- [ ] **Step 1: Write failing component tests**

Render `WorkoutsPage` with an in-memory `WorkoutsRepository`. Assert it:

```ts
await user.type(screen.getByLabelText('训练部位'), '胸');
await user.type(screen.getByLabelText('时长（分钟）'), '60');
await user.type(screen.getByLabelText('动作名称'), '卧推');
await user.type(screen.getByLabelText('重量（千克）'), '60');
await user.type(screen.getByLabelText('次数'), '8');
await user.click(screen.getByLabelText('已完成'));
await user.click(screen.getByRole('button', { name: '保存训练' }));
expect(await screen.findByRole('heading', { name: '胸 · 60 分钟' })).toBeInTheDocument();
expect(screen.getByText('训练容量 480 kg')).toBeInTheDocument();
```

Also assert unchecked sets do not count toward volume, deleting a workout removes it, and `复制上次训练` creates a new workout with a new id on the selected date.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/workouts/WorkoutsPage.test.tsx src/app/App.test.tsx`

Expected: fail because `WorkoutsPage` is not implemented.

- [ ] **Step 3: Implement UI and route**

Keep the first release small: one editable exercise row and one set row in the form, plus an `添加组` button if that stays under the task write set. Store body parts as comma/Chinese-comma separated strings trimmed into an array. Completed checkbox defaults to checked. Failure states show generic Chinese errors and keep the previous list.

- [ ] **Step 4: Run GREEN**

Run: `pnpm_config_verify_deps_before_run=warn pnpm vitest run src/features/workouts/WorkoutsPage.test.tsx src/app/App.test.tsx`

Expected: selected tests pass.

## Task 6: Mobile E2E, Status, And Review Prep

**Files:**
- Create: `tests/e2e/weight-workouts.spec.ts`
- Modify: `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md`

**Interfaces:**
- Consumes routes `/weight?test-platform=1` and `/workouts?test-platform=1`.
- Produces Task 4 and Task 5 evidence in the Anvil plan.

- [ ] **Step 1: Write failing E2E**

Use the test platform route. Log in via OTP, go to `/weight?test-platform=1`, create a weight entry and assert it appears. Then go to `/workouts?test-platform=1`, create a workout with one completed set, assert volume appears, copy latest to tomorrow, and assert two sessions exist.

- [ ] **Step 2: Run RED**

Run: `pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line tests/e2e/weight-workouts.spec.ts`

Expected before UI wiring: E2E fails because routes/pages do not exist.

- [ ] **Step 3: Update plan status**

In `docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md`, set Task 4 and Task 5 `Code Status`, `Actual Write Set`, `Verification`, and `Evidence`; leave real CloudBase smoke marked blocked until the isolated environment is configured.

- [ ] **Step 4: Full verification**

Run:

```bash
pnpm_config_verify_deps_before_run=warn pnpm lint
pnpm_config_verify_deps_before_run=warn pnpm typecheck
pnpm_config_verify_deps_before_run=warn pnpm test
pnpm_config_verify_deps_before_run=warn pnpm build
pnpm_config_verify_deps_before_run=warn pnpm test:e2e --project=mobile-chromium --reporter=line
git diff --check
```

Expected: all automated checks pass except real CloudBase manual spec remains skipped.

## Self-Review

- Spec coverage: body weight recording, 7-day average, 21-day ±100 kcal suggestion, workout sessions, exercises, sets, copy latest, completed-set volume, mobile E2E and per-user isolation each map to Tasks 1-6.
- Placeholder scan: no `TBD`, `TODO`, or vague "handle edge cases" steps remain.
- Type consistency: repository method names match CloudBase RPC adapter, test platform, UI and migration tasks.
