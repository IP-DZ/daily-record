import { describe, expect, it } from 'vitest';

import { calculateNutritionTargets } from './index';

describe('calculateNutritionTargets', () => {
  it('calculates the accepted male example without rounding internal values', () => {
    const result = calculateNutritionTargets({
      age: 30,
      sex: 'male',
      heightCm: 175,
      weightKg: 70,
      activityLevel: 'moderate',
      proteinGramsPerKg: 1.6,
      fatCalorieRatio: 0.25,
      surplusRatio: 0.1,
    });

    expect(result.restingKcal).toBeCloseTo(1648.75, 5);
    expect(result.maintenanceKcal).toBeCloseTo(2555.5625, 5);
    expect(result.caloriesKcal).toBeCloseTo(2811.11875, 5);
    expect(result.proteinGrams).toBeCloseTo(112, 5);
    expect(result.fatGrams).toBeCloseTo(78.0866, 3);
    expect(result.carbsGrams).toBeCloseTo(415.0848, 3);
  });

  it('uses the female Mifflin constant', () => {
    const result = calculateNutritionTargets({
      age: 30,
      sex: 'female',
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'sedentary',
      proteinGramsPerKg: 1.8,
      fatCalorieRatio: 0.25,
      surplusRatio: 0.1,
    });

    expect(result.restingKcal).toBeCloseTo(1320.25, 5);
  });

  it.each([
    ['sedentary', 1.2],
    ['light', 1.375],
    ['moderate', 1.55],
    ['high', 1.725],
    ['veryHigh', 1.9],
  ] as const)('uses the accepted %s activity factor', (activityLevel, factor) => {
    const result = calculateNutritionTargets({
      age: 30,
      sex: 'male',
      heightCm: 175,
      weightKg: 70,
      activityLevel,
      proteinGramsPerKg: 1.6,
      fatCalorieRatio: 0.25,
      surplusRatio: 0.1,
    });

    expect(result.maintenanceKcal).toBeCloseTo(result.restingKcal * factor, 10);
  });
});
