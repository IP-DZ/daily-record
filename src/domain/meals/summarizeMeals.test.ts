import { describe, expect, it } from 'vitest';

import { summarizeMeals } from './summarizeMeals';

describe('summarizeMeals', () => {
  it('sums nutrition totals across meals without rounding decimals', () => {
    expect(
      summarizeMeals([
        {
          nutrition: {
            caloriesKcal: 600.5,
            proteinGrams: 35.2,
            fatGrams: 18,
            carbsGrams: 72.3,
          },
        },
        {
          nutrition: {
            caloriesKcal: 260,
            proteinGrams: 12,
            fatGrams: 9.5,
            carbsGrams: 28,
          },
        },
      ]),
    ).toEqual({
      caloriesKcal: 860.5,
      proteinGrams: 47.2,
      fatGrams: 27.5,
      carbsGrams: 100.3,
    });
  });
});
