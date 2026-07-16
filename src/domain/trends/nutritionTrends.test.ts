import { describe, expect, it } from 'vitest';

import {
  buildDailyNutritionTrend,
  buildWeeklyNutritionTrend,
  selectGoalForDate,
} from './nutritionTrends';

const baseTarget = {
  restingKcal: 1700,
  maintenanceKcal: 2600,
  caloriesKcal: 2860,
  proteinGrams: 140,
  fatGrams: 79,
  carbsGrams: 390,
};

const higherTarget = {
  restingKcal: 1750,
  maintenanceKcal: 2700,
  caloriesKcal: 2970,
  proteinGrams: 150,
  fatGrams: 83,
  carbsGrams: 405,
};

const goalVersions = [
  {
    version: 1,
    effectiveDate: '2026-07-01',
    targets: baseTarget,
    createdAt: '2026-07-01T08:00:00.000Z',
  },
  {
    version: 2,
    effectiveDate: '2026-07-10',
    targets: higherTarget,
    createdAt: '2026-07-10T08:00:00.000Z',
  },
];

describe('nutrition trends', () => {
  it('selects the latest goal version effective on or before the target date', () => {
    expect(selectGoalForDate(goalVersions, '2026-06-30')).toBeNull();
    expect(selectGoalForDate(goalVersions, '2026-07-09')).toEqual(baseTarget);
    expect(selectGoalForDate(goalVersions, '2026-07-10')).toEqual(higherTarget);
    expect(selectGoalForDate([...goalVersions].reverse(), '2026-07-14')).toEqual(higherTarget);
  });

  it('builds daily trend points with zero intake for empty days and null completion when no goal exists', () => {
    const points = buildDailyNutritionTrend({
      startDate: '2026-06-30',
      endDate: '2026-07-02',
      mealsByDate: {
        '2026-07-01': {
          caloriesKcal: 1430,
          proteinGrams: 70,
          fatGrams: 39.5,
          carbsGrams: 195,
        },
      },
      goalVersions,
    });

    expect(points).toEqual([
      {
        date: '2026-06-30',
        consumed: { caloriesKcal: 0, proteinGrams: 0, fatGrams: 0, carbsGrams: 0 },
        target: null,
        completion: { calories: null, protein: null, fat: null, carbs: null },
      },
      {
        date: '2026-07-01',
        consumed: { caloriesKcal: 1430, proteinGrams: 70, fatGrams: 39.5, carbsGrams: 195 },
        target: baseTarget,
        completion: { calories: 0.5, protein: 0.5, fat: 0.5, carbs: 0.5 },
      },
      {
        date: '2026-07-02',
        consumed: { caloriesKcal: 0, proteinGrams: 0, fatGrams: 0, carbsGrams: 0 },
        target: baseTarget,
        completion: { calories: 0, protein: 0, fat: 0, carbs: 0 },
      },
    ]);
  });

  it('builds weekly summaries for partial and complete weeks', () => {
    const daily = buildDailyNutritionTrend({
      startDate: '2026-07-01',
      endDate: '2026-07-08',
      mealsByDate: {
        '2026-07-01': { caloriesKcal: 1000, proteinGrams: 50, fatGrams: 20, carbsGrams: 120 },
        '2026-07-02': { caloriesKcal: 1200, proteinGrams: 60, fatGrams: 30, carbsGrams: 130 },
        '2026-07-08': { caloriesKcal: 1400, proteinGrams: 70, fatGrams: 40, carbsGrams: 150 },
      },
      goalVersions,
    });

    expect(buildWeeklyNutritionTrend(daily)).toEqual([
      {
        weekStartDate: '2026-07-01',
        weekEndDate: '2026-07-07',
        dayCount: 7,
        consumed: { caloriesKcal: 2200, proteinGrams: 110, fatGrams: 50, carbsGrams: 250 },
        target: {
          caloriesKcal: 20020,
          proteinGrams: 980,
          fatGrams: 553,
          carbsGrams: 2730,
        },
        completion: {
          calories: 2200 / 20020,
          protein: 110 / 980,
          fat: 50 / 553,
          carbs: 250 / 2730,
        },
      },
      {
        weekStartDate: '2026-07-08',
        weekEndDate: '2026-07-08',
        dayCount: 1,
        consumed: { caloriesKcal: 1400, proteinGrams: 70, fatGrams: 40, carbsGrams: 150 },
        target: {
          caloriesKcal: 2860,
          proteinGrams: 140,
          fatGrams: 79,
          carbsGrams: 390,
        },
        completion: {
          calories: 1400 / 2860,
          protein: 70 / 140,
          fat: 40 / 79,
          carbs: 150 / 390,
        },
      },
    ]);
  });
});
