import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MealNutritionTotals, NutritionGoalVersion } from '@daily-record/contracts';
import type { MealsRepository } from '../../platform/meals';
import type { NutritionGoalsRepository } from '../../platform/nutritionGoals';
import { NutritionTrendsPage } from './NutritionTrendsPage';

const zeroTotals: MealNutritionTotals = {
  caloriesKcal: 0,
  proteinGrams: 0,
  fatGrams: 0,
  carbsGrams: 0,
};

function mealsRepository(days: Record<string, MealNutritionTotals>): MealsRepository {
  return {
    listByDate: vi.fn(async (date: string) => ({
      meals: [],
      totals: days[date] ?? zeroTotals,
    })),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
  } as MealsRepository;
}

function goalsRepository(goals: NutritionGoalVersion[]): NutritionGoalsRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(goals),
  };
}

const goals: NutritionGoalVersion[] = [
  {
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
  },
  {
    version: 2,
    effectiveDate: '2026-07-10',
    targets: {
      restingKcal: 1750,
      maintenanceKcal: 2700,
      caloriesKcal: 2970,
      proteinGrams: 150,
      fatGrams: 83,
      carbsGrams: 405,
    },
    createdAt: '2026-07-10T08:00:00.000Z',
  },
];

describe('NutritionTrendsPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows daily nutrition completion against the goal version effective on each date', async () => {
    const meals = mealsRepository({
      '2026-07-09': {
        caloriesKcal: 1430,
        proteinGrams: 70,
        fatGrams: 39.5,
        carbsGrams: 195,
      },
      '2026-07-10': {
        caloriesKcal: 1485,
        proteinGrams: 75,
        fatGrams: 41.5,
        carbsGrams: 202.5,
      },
    });
    const nutritionGoals = goalsRepository(goals);

    render(
      <NutritionTrendsPage
        meals={meals}
        nutritionGoals={nutritionGoals}
        initialEndDate="2026-07-14"
      />,
    );

    expect(await screen.findByRole('heading', { name: '营养趋势' })).toBeInTheDocument();
    expect(screen.getByText('目标和摄入均为估算，不构成医疗建议。')).toBeInTheDocument();

    const dailyTable = within(screen.getByLabelText('每日营养趋势'));
    const july9 = dailyTable.getByRole('row', { name: /2026-07-09/ });
    expect(within(july9).getByText('1430 / 2860 kcal')).toBeInTheDocument();
    expect(within(july9).getByText('50%')).toBeInTheDocument();

    const july10 = dailyTable.getByRole('row', { name: /2026-07-10/ });
    expect(within(july10).getByText('1485 / 2970 kcal')).toBeInTheDocument();
    expect(within(july10).getByText('50%')).toBeInTheDocument();

    expect(nutritionGoals.listByDateRange).toHaveBeenCalledWith('2026-07-08', '2026-07-14');
    expect(meals.listByDate).toHaveBeenCalledTimes(7);
  });

  it('shows an empty target state without pretending completion is zero', async () => {
    render(
      <NutritionTrendsPage
        meals={mealsRepository({})}
        nutritionGoals={goalsRepository([])}
        initialEndDate="2026-07-14"
      />,
    );

    const dailyTable = within(screen.getByLabelText('每日营养趋势'));
    const firstRow = await dailyTable.findByRole('row', { name: /2026-07-08/ });
    expect(within(firstRow).getByText('暂无目标')).toBeInTheDocument();
    expect(within(firstRow).getAllByText('—')[0]).toBeInTheDocument();
  });

  it('can switch from 7 days to 28 days and reloads the wider range', async () => {
    const meals = mealsRepository({});
    const nutritionGoals = goalsRepository(goals);
    render(
      <NutritionTrendsPage
        meals={meals}
        nutritionGoals={nutritionGoals}
        initialEndDate="2026-07-14"
      />,
    );

    const dailyTable = within(screen.getByLabelText('每日营养趋势'));
    await dailyTable.findByRole('row', { name: /2026-07-08/ });
    await userEvent.click(screen.getByRole('button', { name: '近 28 天' }));

    await waitFor(() => {
      expect(nutritionGoals.listByDateRange).toHaveBeenLastCalledWith('2026-06-17', '2026-07-14');
    });
    expect(meals.listByDate).toHaveBeenCalledWith('2026-06-17');
  });
});
