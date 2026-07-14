import { z } from 'zod';

export interface MealNutritionTotals {
  caloriesKcal: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
}

export interface MealEntry {
  id: string;
  mealDate: string;
  name: string;
  amount: string;
  nutrition: MealNutritionTotals;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMealInput {
  mealDate: string;
  name: string;
  amount: string;
  nutrition: MealNutritionTotals;
}

export interface UpdateMealInput {
  id: string;
  mealDate: string;
  name: string;
  amount: string;
  nutrition: MealNutritionTotals;
}

const mealDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mealTextSchema = z.string().min(1).max(80);

export const mealNutritionTotalsSchema: z.ZodType<MealNutritionTotals> = z
  .object({
    caloriesKcal: z.number().finite().nonnegative(),
    proteinGrams: z.number().finite().nonnegative(),
    fatGrams: z.number().finite().nonnegative(),
    carbsGrams: z.number().finite().nonnegative(),
  })
  .strict();

const createMealInputObjectSchema = z
  .object({
    mealDate: mealDateSchema,
    name: mealTextSchema,
    amount: mealTextSchema,
    nutrition: mealNutritionTotalsSchema,
  })
  .strict();

export const createMealInputSchema: z.ZodType<CreateMealInput> = createMealInputObjectSchema;

export const updateMealInputSchema: z.ZodType<UpdateMealInput> = createMealInputObjectSchema
  .extend({
    id: z.string().min(1),
  })
  .strict();

export const mealEntrySchema: z.ZodType<MealEntry> = createMealInputObjectSchema
  .extend({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
