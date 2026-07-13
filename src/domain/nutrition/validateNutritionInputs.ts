import { z } from 'zod';

import { calculateNutritionTargets } from './calculateNutritionTargets';

export const nutritionInputsSchema = z
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
  .superRefine((input, context) => {
    if (calculateNutritionTargets(input).carbsGrams < 0) {
      context.addIssue({
        code: 'custom',
        message: '碳水目标不能为负数',
      });
    }
  });
