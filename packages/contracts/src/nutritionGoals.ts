import { z } from 'zod';

import { type NutritionTargets } from './profileSettings';

export interface NutritionGoalVersion {
  version: number;
  effectiveDate: string;
  targets: NutritionTargets;
  createdAt: string;
}

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

export const nutritionGoalVersionSchema: z.ZodType<NutritionGoalVersion> = z
  .object({
    version: z.number().int().positive(),
    effectiveDate: isoDateSchema,
    targets: nutritionTargetsSchema,
    createdAt: z.string().min(1),
  })
  .strict();
