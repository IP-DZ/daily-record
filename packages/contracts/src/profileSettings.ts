import { z } from 'zod';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh';
export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';

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

export interface ProfileSettingsDraft {
  inputs: NutritionInputs;
  trainingDaysPerWeek: number;
  trainingExperience: TrainingExperience;
  targets: NutritionTargets;
}

export type ProfileSettingsPayload = ProfileSettingsDraft & {
  schemaVersion: 1;
};

const nutritionInputsSchema: z.ZodType<NutritionInputs> = z
  .object({
    age: z.number().int().min(18).max(100),
    sex: z.enum(['male', 'female']),
    heightCm: z.number().min(100).max(250),
    weightKg: z.number().min(30).max(350),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'high', 'veryHigh']),
    proteinGramsPerKg: z.number().min(1.6).max(2.2),
    fatCalorieRatio: z.number().min(0.15).max(0.4),
    surplusRatio: z.number().min(0).max(0.3),
  })
  .strict();

const nutritionTargetsSchema: z.ZodType<NutritionTargets> = z
  .object({
    restingKcal: z.number().finite().nonnegative(),
    maintenanceKcal: z.number().finite().nonnegative(),
    caloriesKcal: z.number().finite().nonnegative(),
    proteinGrams: z.number().finite().nonnegative(),
    fatGrams: z.number().finite().nonnegative(),
    carbsGrams: z.number().finite().nonnegative(),
  })
  .strict();

const trainingExperienceSchema: z.ZodType<TrainingExperience> = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);

export const profileSettingsSchema: z.ZodType<ProfileSettingsPayload> = z
  .object({
    schemaVersion: z.literal(1),
    inputs: nutritionInputsSchema,
    trainingDaysPerWeek: z.number().int().min(0).max(7),
    trainingExperience: trainingExperienceSchema,
    targets: nutritionTargetsSchema,
  })
  .strict();
