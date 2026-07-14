import {
  authUserSchema,
  createMealInputSchema,
  mealEntrySchema,
  profileSettingsSchema,
  updateMealInputSchema,
  type AuthUser,
  type MealEntry,
  type ProfileSettingsDraft,
  type ProfileSettingsPayload,
} from '@daily-record/contracts';

import { summarizeMeals } from '../../domain/meals';
import type { AuthPort } from '../auth';
import type { MealsRepository } from '../meals';
import type { ProfileSettingsRepository } from '../settings/ProfileSettingsRepository';

const ENDPOINT = '/__daily-record-test-platform';
const CLIENT_KEY = 'daily-record:test-platform-client';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type TestPlatform = {
  auth: AuthPort;
  profileSettings: ProfileSettingsRepository;
  meals: MealsRepository;
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

export function createTestPlatform(fetcher: Fetcher = fetch): TestPlatform {
  const mealsByUserId = new Map<string, MealEntry[]>();
  let nextMealId = 1;

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

  return { auth, profileSettings, meals };
}
