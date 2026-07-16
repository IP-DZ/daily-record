import {
  createMealInputSchema,
  mealEntrySchema,
  mealNutritionTotalsSchema,
  updateMealInputSchema,
  type CreateMealInput,
  type MealEntry,
  type MealNutritionTotals,
  type UpdateMealInput,
} from '@daily-record/contracts';

import type { MealsByDate, MealsRepository } from '../meals';
import { MealsRepositoryError } from '../meals';

type MealRpcName =
  | 'list_my_meals_by_date'
  | 'create_my_meal'
  | 'update_my_meal'
  | 'delete_my_meal'
  | 'copy_my_meal';

export interface CloudBaseMealsRdbClient {
  rpc(
    name: MealRpcName,
    parameters?:
      | { meal_date: string }
      | { payload: CreateMealInput | UpdateMealInput }
      | { meal_id: string }
      | { meal_id: string; target_meal_date: string },
  ): Promise<{ data: unknown; error?: unknown }>;
}

function requireMealDate(mealDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) {
    throw new MealsRepositoryError();
  }
  return mealDate;
}

function requireMealId(id: string): string {
  if (id.trim().length === 0) {
    throw new MealsRepositoryError();
  }
  return id;
}

function parseMeal(value: unknown): MealEntry {
  return mealEntrySchema.parse(value);
}

function parseMealsByDate(value: unknown): MealsByDate {
  if (typeof value !== 'object' || value === null) {
    throw new MealsRepositoryError();
  }
  const { meals, totals } = value as { meals?: unknown; totals?: unknown };
  if (!Array.isArray(meals)) {
    throw new MealsRepositoryError();
  }
  return {
    meals: meals.map(parseMeal),
    totals: mealNutritionTotalsSchema.parse(totals) as MealNutritionTotals,
  };
}

function assertNoProviderError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new MealsRepositoryError();
  }
}

export class CloudBaseMealsRepository implements MealsRepository {
  constructor(private readonly rdb: CloudBaseMealsRdbClient) {}

  async listByDate(mealDate: string): Promise<MealsByDate> {
    try {
      const response = await this.rdb.rpc('list_my_meals_by_date', {
        meal_date: requireMealDate(mealDate),
      });
      assertNoProviderError(response);
      return parseMealsByDate(response.data);
    } catch {
      throw new MealsRepositoryError();
    }
  }

  async create(input: CreateMealInput): Promise<MealEntry> {
    try {
      const payload = createMealInputSchema.parse(input);
      const response = await this.rdb.rpc('create_my_meal', { payload });
      assertNoProviderError(response);
      return parseMeal(response.data);
    } catch {
      throw new MealsRepositoryError();
    }
  }

  async update(input: UpdateMealInput): Promise<MealEntry> {
    try {
      const payload = updateMealInputSchema.parse(input);
      const response = await this.rdb.rpc('update_my_meal', { payload });
      assertNoProviderError(response);
      return parseMeal(response.data);
    } catch {
      throw new MealsRepositoryError();
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const response = await this.rdb.rpc('delete_my_meal', {
        meal_id: requireMealId(id),
      });
      assertNoProviderError(response);
    } catch {
      throw new MealsRepositoryError();
    }
  }

  async copy(id: string, mealDate: string): Promise<MealEntry> {
    try {
      const response = await this.rdb.rpc('copy_my_meal', {
        meal_id: requireMealId(id),
        target_meal_date: requireMealDate(mealDate),
      });
      assertNoProviderError(response);
      return parseMeal(response.data);
    } catch {
      throw new MealsRepositoryError();
    }
  }
}
