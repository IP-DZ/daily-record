import type { NutritionGoalVersion } from '@daily-record/contracts';

export interface NutritionGoalsRepository {
  listByDateRange(startDate: string, endDate: string): Promise<NutritionGoalVersion[]>;
}

export class NutritionGoalsRepositoryError extends Error {
  readonly code = 'nutrition-goals/unavailable';

  constructor() {
    super('Nutrition goals are unavailable');
    this.name = 'NutritionGoalsRepositoryError';
  }
}
