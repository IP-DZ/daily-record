import {
  authUserSchema,
  createMealInputSchema,
  createWeightEntryInputSchema,
  createWorkoutInputSchema,
  mealEntrySchema,
  profileSettingsSchema,
  updateMealInputSchema,
  updateWeightEntryInputSchema,
  updateWorkoutInputSchema,
  weightEntrySchema,
  workoutSessionSchema,
  type AuthUser,
  type MealEntry,
  type ProfileSettingsDraft,
  type ProfileSettingsPayload,
  type WeightEntry,
  type WorkoutSession,
} from '@daily-record/contracts';

import { summarizeMeals } from '../../domain/meals';
import { calculateWorkoutVolume } from '../../domain/workouts';
import type { AuthPort } from '../auth';
import type { MealsRepository } from '../meals';
import type { ProfileSettingsRepository } from '../settings/ProfileSettingsRepository';
import type { WeightRepository } from '../weight';
import type { WorkoutsRepository } from '../workouts';

const ENDPOINT = '/__daily-record-test-platform';
const CLIENT_KEY = 'daily-record:test-platform-client';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type TestPlatform = {
  auth: AuthPort;
  profileSettings: ProfileSettingsRepository;
  meals: MealsRepository;
  weight: WeightRepository;
  workouts: WorkoutsRepository;
};

function toDraft(value: ProfileSettingsPayload): ProfileSettingsDraft {
  return {
    inputs: value.inputs,
    trainingDaysPerWeek: value.trainingDaysPerWeek,
    trainingExperience: value.trainingExperience,
    targets: value.targets,
  };
}

function clientId(): string {
  const existing = window.localStorage.getItem(CLIENT_KEY);
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_KEY, created);
  return created;
}

async function call(
  fetcher: Fetcher,
  operation: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation, clientId: clientId(), ...input }),
  });
  if (!response.ok) throw new Error('Test platform unavailable');
  return response.json();
}

function assertMealDate(mealDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) {
    throw new Error('Invalid meal date');
  }
  return mealDate;
}

function assertDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date');
  }
  return date;
}

export function createTestPlatform(fetcher: Fetcher = fetch): TestPlatform {
  const mealsByUserId = new Map<string, MealEntry[]>();
  const weightByUserId = new Map<string, WeightEntry[]>();
  const workoutsByUserId = new Map<string, WorkoutSession[]>();
  let nextMealId = 1;
  let nextWeightId = 1;
  let nextWorkoutId = 1;
  let nextExerciseId = 1;
  let nextSetId = 1;

  async function requireCurrentUserId(): Promise<string> {
    const response = await call(fetcher, 'current-user') as { user?: unknown };
    if (response.user === null || response.user === undefined) {
      throw new Error('Test platform requires an authenticated user');
    }
    return authUserSchema.parse(response.user).userId;
  }

  function userMeals(userId: string): MealEntry[] {
    const existing = mealsByUserId.get(userId);
    if (existing !== undefined) return existing;
    const created: MealEntry[] = [];
    mealsByUserId.set(userId, created);
    return created;
  }

  function userWeight(userId: string): WeightEntry[] {
    const existing = weightByUserId.get(userId);
    if (existing !== undefined) return existing;
    const created: WeightEntry[] = [];
    weightByUserId.set(userId, created);
    return created;
  }

  function userWorkouts(userId: string): WorkoutSession[] {
    const existing = workoutsByUserId.get(userId);
    if (existing !== undefined) return existing;
    const created: WorkoutSession[] = [];
    workoutsByUserId.set(userId, created);
    return created;
  }

  function timestamp(): string {
    return new Date().toISOString();
  }

  const auth: AuthPort = {
    async requestEmailCode(email) {
      try {
        await call(fetcher, 'request-code', { email });
      } catch {
        throw { code: 'auth/network' };
      }
    },
    async verifyEmailCode(email, code): Promise<AuthUser> {
      try {
        const response = await call(fetcher, 'verify-code', { email, code });
        return authUserSchema.parse((response as { user?: unknown }).user);
      } catch {
        throw { code: 'auth/code-invalid' };
      }
    },
    async currentUser(): Promise<AuthUser | null> {
      try {
        const response = await call(fetcher, 'current-user') as { user?: unknown };
        return response.user === null ? null : authUserSchema.parse(response.user);
      } catch {
        throw { code: 'auth/network' };
      }
    },
    async signOut() {
      try {
        await call(fetcher, 'sign-out');
      } catch {
        throw { code: 'auth/network' };
      }
    },
  };

  const meals: MealsRepository = {
    async listByDate(mealDate) {
      const userId = await requireCurrentUserId();
      const date = assertMealDate(mealDate);
      const mealsForDate = userMeals(userId).filter((meal) => meal.mealDate === date);
      return {
        meals: mealsForDate.map((meal) => mealEntrySchema.parse(meal)),
        totals: summarizeMeals(mealsForDate),
      };
    },
    async create(input) {
      const userId = await requireCurrentUserId();
      const parsed = createMealInputSchema.parse(input);
      const now = timestamp();
      const meal = mealEntrySchema.parse({
        id: `test-meal-${nextMealId++}`,
        ...parsed,
        createdAt: now,
        updatedAt: now,
      });
      userMeals(userId).push(meal);
      return meal;
    },
    async update(input) {
      const userId = await requireCurrentUserId();
      const parsed = updateMealInputSchema.parse(input);
      const mealsForUser = userMeals(userId);
      const index = mealsForUser.findIndex((meal) => meal.id === parsed.id);
      if (index < 0) throw new Error('Meal not found');
      const updated = mealEntrySchema.parse({
        ...mealsForUser[index],
        ...parsed,
        updatedAt: timestamp(),
      });
      mealsForUser[index] = updated;
      return updated;
    },
    async delete(id) {
      const userId = await requireCurrentUserId();
      const mealsForUser = userMeals(userId);
      const index = mealsForUser.findIndex((meal) => meal.id === id);
      if (index < 0) throw new Error('Meal not found');
      mealsForUser.splice(index, 1);
    },
    async copy(id, mealDate) {
      const userId = await requireCurrentUserId();
      const date = assertMealDate(mealDate);
      const source = userMeals(userId).find((meal) => meal.id === id);
      if (source === undefined) throw new Error('Meal not found');
      const now = timestamp();
      const copied = mealEntrySchema.parse({
        id: `test-meal-${nextMealId++}`,
        mealDate: date,
        name: source.name,
        amount: source.amount,
        nutrition: source.nutrition,
        createdAt: now,
        updatedAt: now,
      });
      userMeals(userId).push(copied);
      return copied;
    },
  };

  const weight: WeightRepository = {
    async listByDateRange(startDate, endDate) {
      const userId = await requireCurrentUserId();
      const start = assertDate(startDate);
      const end = assertDate(endDate);
      return userWeight(userId)
        .filter((entry) => entry.entryDate >= start && entry.entryDate <= end)
        .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id))
        .map((entry) => weightEntrySchema.parse(entry));
    },
    async create(input) {
      const userId = await requireCurrentUserId();
      const parsed = createWeightEntryInputSchema.parse(input);
      const now = timestamp();
      const entry = weightEntrySchema.parse({
        id: `test-weight-${nextWeightId++}`,
        ...parsed,
        note: parsed.note ?? '',
        createdAt: now,
        updatedAt: now,
      });
      userWeight(userId).push(entry);
      return entry;
    },
    async update(input) {
      const userId = await requireCurrentUserId();
      const parsed = updateWeightEntryInputSchema.parse(input);
      const entries = userWeight(userId);
      const index = entries.findIndex((entry) => entry.id === parsed.id);
      if (index < 0) throw new Error('Weight entry not found');
      const updated = weightEntrySchema.parse({
        ...entries[index],
        ...parsed,
        note: parsed.note ?? '',
        updatedAt: timestamp(),
      });
      entries[index] = updated;
      return updated;
    },
    async delete(id) {
      const userId = await requireCurrentUserId();
      const entries = userWeight(userId);
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error('Weight entry not found');
      entries.splice(index, 1);
    },
  };

  function createStoredWorkout(input: unknown, workoutId: string, workoutDateOverride?: string): WorkoutSession {
    const parsed = createWorkoutInputSchema.parse(input);
    const now = timestamp();
    const sessionWithoutVolume = {
      id: workoutId,
      ...parsed,
      workoutDate: workoutDateOverride ?? parsed.workoutDate,
      note: parsed.note ?? '',
      exercises: parsed.exercises.map((exercise) => ({
        ...exercise,
        id: `test-exercise-${nextExerciseId++}`,
        sets: exercise.sets.map((set) => ({
          ...set,
          id: `test-set-${nextSetId++}`,
        })),
      })),
      createdAt: now,
      updatedAt: now,
    };
    return workoutSessionSchema.parse({
      ...sessionWithoutVolume,
      volumeKg: calculateWorkoutVolume(sessionWithoutVolume),
    });
  }

  const workouts: WorkoutsRepository = {
    async listByDateRange(startDate, endDate) {
      const userId = await requireCurrentUserId();
      const start = assertDate(startDate);
      const end = assertDate(endDate);
      return userWorkouts(userId)
        .filter((workout) => workout.workoutDate >= start && workout.workoutDate <= end)
        .sort((a, b) => a.workoutDate.localeCompare(b.workoutDate) || a.id.localeCompare(b.id))
        .map((workout) => workoutSessionSchema.parse(workout));
    },
    async create(input) {
      const userId = await requireCurrentUserId();
      const workout = createStoredWorkout(input, `test-workout-${nextWorkoutId++}`);
      userWorkouts(userId).push(workout);
      return workout;
    },
    async update(input) {
      const userId = await requireCurrentUserId();
      const parsed = updateWorkoutInputSchema.parse(input);
      const sessions = userWorkouts(userId);
      const index = sessions.findIndex((workout) => workout.id === parsed.id);
      if (index < 0) throw new Error('Workout not found');
      const { id, ...rest } = parsed;
      const updated = createStoredWorkout(rest, id);
      sessions[index] = updated;
      return updated;
    },
    async delete(id) {
      const userId = await requireCurrentUserId();
      const sessions = userWorkouts(userId);
      const index = sessions.findIndex((workout) => workout.id === id);
      if (index < 0) throw new Error('Workout not found');
      sessions.splice(index, 1);
    },
    async copyLatest(targetDate) {
      const userId = await requireCurrentUserId();
      const date = assertDate(targetDate);
      const latest = [...userWorkouts(userId)]
        .filter((workout) => workout.workoutDate <= date)
        .sort((a, b) => b.workoutDate.localeCompare(a.workoutDate) || b.createdAt.localeCompare(a.createdAt))[0];
      if (latest === undefined) throw new Error('Workout not found');
      const copied = createStoredWorkout({
        workoutDate: date,
        bodyParts: latest.bodyParts,
        durationMinutes: latest.durationMinutes,
        note: latest.note,
        exercises: latest.exercises,
      }, `test-workout-${nextWorkoutId++}`, date);
      userWorkouts(userId).push(copied);
      return copied;
    },
  };

  const profileSettings: ProfileSettingsRepository = {
    async load(): Promise<ProfileSettingsDraft | null> {
      const response = await call(fetcher, 'load-profile') as { value?: unknown };
      if (response.value === null) return null;
      const parsed = profileSettingsSchema.parse({ schemaVersion: 1, ...(response.value as object) });
      return toDraft(parsed);
    },
    async save(value) {
      const parsed = profileSettingsSchema.parse({ schemaVersion: 1, ...value });
      await call(fetcher, 'save-profile', { value: toDraft(parsed) });
    },
  };

  return { auth, profileSettings, meals, weight, workouts };
}
