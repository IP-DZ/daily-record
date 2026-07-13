import type { ActivityLevel, NutritionInputs, NutritionTargets } from './types';

const activityFactors: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  veryHigh: 1.9,
};

export function calculateNutritionTargets(input: NutritionInputs): NutritionTargets {
  const sexConstant = input.sex === 'male' ? 5 : -161;
  const restingKcal =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
  const maintenanceKcal = restingKcal * activityFactors[input.activityLevel];
  const caloriesKcal = maintenanceKcal * (1 + input.surplusRatio);
  const proteinGrams = input.weightKg * input.proteinGramsPerKg;
  const fatGrams = (caloriesKcal * input.fatCalorieRatio) / 9;
  const carbsGrams = (caloriesKcal - proteinGrams * 4 - fatGrams * 9) / 4;

  return {
    restingKcal,
    maintenanceKcal,
    caloriesKcal,
    proteinGrams,
    fatGrams,
    carbsGrams,
  };
}
