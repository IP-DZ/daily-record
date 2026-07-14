import type { MealEntry, MealNutritionTotals } from '@daily-record/contracts';

export function summarizeMeals(
  meals: readonly Pick<MealEntry, 'nutrition'>[],
): MealNutritionTotals {
  return meals.reduce<MealNutritionTotals>(
    (totals, meal) => ({
      caloriesKcal: totals.caloriesKcal + meal.nutrition.caloriesKcal,
      proteinGrams: totals.proteinGrams + meal.nutrition.proteinGrams,
      fatGrams: totals.fatGrams + meal.nutrition.fatGrams,
      carbsGrams: totals.carbsGrams + meal.nutrition.carbsGrams,
    }),
    {
      caloriesKcal: 0,
      proteinGrams: 0,
      fatGrams: 0,
      carbsGrams: 0,
    },
  );
}
