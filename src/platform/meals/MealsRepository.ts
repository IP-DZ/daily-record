import type {
  CreateMealInput,
  MealEntry,
  MealNutritionTotals,
  UpdateMealInput,
} from '@daily-record/contracts';

export interface MealsByDate {
  meals: MealEntry[];
  totals: MealNutritionTotals;
}

export interface MealsRepository {
  listByDate(mealDate: string): Promise<MealsByDate>;
  create(input: CreateMealInput): Promise<MealEntry>;
  update(input: UpdateMealInput): Promise<MealEntry>;
  delete(id: string): Promise<void>;
  copy(id: string, mealDate: string): Promise<MealEntry>;
}

export class MealsRepositoryError extends Error {
  readonly code = 'meals/unavailable';

  constructor() {
    super('Meals are unavailable');
    this.name = 'MealsRepositoryError';
  }
}
