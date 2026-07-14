import { describe, expect, it, vi } from 'vitest';

import type { NutritionGoalVersion } from '@daily-record/contracts';
import { NutritionGoalsRepositoryError } from '../nutritionGoals';
import { CloudBaseNutritionGoalsRepository } from './CloudBaseNutritionGoalsRepository';

const goal: NutritionGoalVersion = {
  version: 1,
  effectiveDate: '2026-07-01',
  targets: {
    restingKcal: 1700,
    maintenanceKcal: 2600,
    caloriesKcal: 2860,
    proteinGrams: 140,
    fatGrams: 79,
    carbsGrams: 390,
  },
  createdAt: '2026-07-01T08:00:00.000Z',
};

describe('CloudBaseNutritionGoalsRepository', () => {
  it('calls owned nutrition goal history RPC with validated range and parses responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [goal], error: null });
    const repository = new CloudBaseNutritionGoalsRepository({ rpc });

    await expect(repository.listByDateRange('2026-07-01', '2026-07-14')).resolves.toEqual([goal]);

    expect(rpc).toHaveBeenCalledWith('list_my_nutrition_goals_by_date_range', {
      start_date: '2026-07-01',
      end_date: '2026-07-14',
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/userId|user_id|email/i);
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private SQL detail' } }],
    ['invalid returned goal', { data: [{ ...goal, version: 0 }], error: null }],
  ])('maps %s to a stable safe nutrition goals error', async (_caseName, response) => {
    const repository = new CloudBaseNutritionGoalsRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.listByDateRange('2026-07-01', '2026-07-14')
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(NutritionGoalsRepositoryError);
    expect(error).toMatchObject({
      code: 'nutrition-goals/unavailable',
      message: 'Nutrition goals are unavailable',
    });
    expect(String(error)).not.toContain('private SQL detail');
  });
});
