export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh';

export interface NutritionInputs {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  proteinGramsPerKg: number;
  fatCalorieRatio: number;
  surplusRatio: number;
}

export interface NutritionTargets {
  restingKcal: number;
  maintenanceKcal: number;
  caloriesKcal: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
}
