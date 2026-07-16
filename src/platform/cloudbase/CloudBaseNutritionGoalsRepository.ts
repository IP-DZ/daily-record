import {
  nutritionGoalVersionSchema,
  type NutritionGoalVersion,
} from '@daily-record/contracts';

import {
  NutritionGoalsRepositoryError,
  type NutritionGoalsRepository,
} from '../nutritionGoals';

export interface CloudBaseNutritionGoalsRdbClient {
  rpc(
    name: 'list_my_nutrition_goals_by_date_range',
    parameters: { start_date: string; end_date: string },
  ): Promise<{ data: unknown; error?: unknown }>;
}

function requireDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new NutritionGoalsRepositoryError();
  }
  return date;
}

function assertNoProviderError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new NutritionGoalsRepositoryError();
  }
}

export class CloudBaseNutritionGoalsRepository implements NutritionGoalsRepository {
  constructor(private readonly rdb: CloudBaseNutritionGoalsRdbClient) {}

  async listByDateRange(startDate: string, endDate: string): Promise<NutritionGoalVersion[]> {
    try {
      const start = requireDate(startDate);
      const end = requireDate(endDate);
      if (start > end) throw new NutritionGoalsRepositoryError();
      const response = await this.rdb.rpc('list_my_nutrition_goals_by_date_range', {
        start_date: start,
        end_date: end,
      });
      assertNoProviderError(response);
      if (!Array.isArray(response.data)) {
        throw new NutritionGoalsRepositoryError();
      }
      return response.data.map((goal) => nutritionGoalVersionSchema.parse(goal));
    } catch {
      throw new NutritionGoalsRepositoryError();
    }
  }
}
