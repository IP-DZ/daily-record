import { describe, expect, it } from 'vitest';

import type {
  NutritionInputs as AppNutritionInputs,
  NutritionTargets as AppNutritionTargets,
} from '../../../src/domain/nutrition/types';
import type { OnboardingDraftInput } from '../../../src/platform/settings/onboardingTypes';
import profileSettingsSource from './profileSettings.ts?raw';
import {
  authUserSchema,
  createMealInputSchema,
  createWeightEntryInputSchema,
  emailCodeSchema,
  emailSchema,
  mealEntrySchema,
  mealNutritionTotalsSchema,
  profileSettingsSchema,
  updateMealInputSchema,
  updateWeightEntryInputSchema,
  weightEntrySchema,
} from './index';
import type {
  CreateMealInput,
  CreateWeightEntryInput,
  MealEntry,
  MealNutritionTotals,
  NutritionInputs,
  NutritionTargets,
  ProfileSettingsDraft,
  UpdateMealInput,
  UpdateWeightEntryInput,
  WeightEntry,
} from './index';

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

const nutritionInputsAreCompatible: IsExact<NutritionInputs, AppNutritionInputs> = true;
const nutritionTargetsAreCompatible: IsExact<NutritionTargets, AppNutritionTargets> = true;
const profileDraftIsCompatible: IsExact<ProfileSettingsDraft, OnboardingDraftInput> = true;
const createMealInputKeepsNutritionShape: IsExact<
  CreateMealInput['nutrition'],
  MealNutritionTotals
> = true;
const updateMealInputKeepsMealId: IsExact<UpdateMealInput['id'], MealEntry['id']> = true;
const createWeightInputKeepsDate: IsExact<CreateWeightEntryInput['entryDate'], string> = true;
const updateWeightInputKeepsId: IsExact<UpdateWeightEntryInput['id'], WeightEntry['id']> = true;

const validSettings = {
  schemaVersion: 1,
  inputs: {
    age: 30,
    sex: 'male',
    heightCm: 178.5,
    weightKg: 72.25,
    activityLevel: 'moderate',
    proteinGramsPerKg: 1.8,
    fatCalorieRatio: 0.25,
    surplusRatio: 0.1,
  },
  trainingDaysPerWeek: 4,
  trainingExperience: 'intermediate',
  targets: {
    restingKcal: 1712.345,
    maintenanceKcal: 2654.13475,
    caloriesKcal: 2919.548225,
    proteinGrams: 130.05,
    fatGrams: 81.09856180555556,
    carbsGrams: 416.1012911875,
  },
} as const;

describe('authentication contracts', () => {
  it('accepts a non-empty authenticated user id', () => {
    expect(authUserSchema.parse({ userId: 'user-123' })).toEqual({ userId: 'user-123' });
  });

  it.each([
    ['empty user id', authUserSchema, { userId: '' }],
    ['invalid email', emailSchema, 'not-an-email'],
    ['five-digit email code', emailCodeSchema, '12345'],
    ['seven-digit email code', emailCodeSchema, '1234567'],
    ['non-numeric email code', emailCodeSchema, 'abcdef'],
  ])('rejects %s', (_label, schema, value) => {
    expect(() => schema.parse(value)).toThrow();
  });
});

describe('profile settings contract', () => {
  it('keeps the contracts production package independent from application source', () => {
    expect(profileSettingsSource).not.toMatch(/from\s+['"](?:\.\.\/)+src\//);
  });

  it('keeps shared DTOs structurally compatible with the application model', () => {
    expect([
      nutritionInputsAreCompatible,
      nutritionTargetsAreCompatible,
      profileDraftIsCompatible,
    ]).toEqual([true, true, true]);
  });

  it('accepts a versioned onboarding payload without rounding decimal values', () => {
    const parsed = profileSettingsSchema.parse(validSettings);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.inputs.weightKg).toBe(72.25);
    expect(parsed.targets).toEqual(validSettings.targets);
  });

  it.each([
    [
      'missing schema version',
      Object.fromEntries(Object.entries(validSettings).filter(([key]) => key !== 'schemaVersion')),
    ],
    ['wrong schema version', { ...validSettings, schemaVersion: 2 }],
    ['age below minimum', { ...validSettings, inputs: { ...validSettings.inputs, age: 17 } }],
    ['age above maximum', { ...validSettings, inputs: { ...validSettings.inputs, age: 101 } }],
    [
      'height below minimum',
      { ...validSettings, inputs: { ...validSettings.inputs, heightCm: 99.99 } },
    ],
    [
      'height above maximum',
      { ...validSettings, inputs: { ...validSettings.inputs, heightCm: 250.01 } },
    ],
    [
      'weight below minimum',
      { ...validSettings, inputs: { ...validSettings.inputs, weightKg: 29.99 } },
    ],
    [
      'weight above maximum',
      { ...validSettings, inputs: { ...validSettings.inputs, weightKg: 350.01 } },
    ],
    [
      'protein below minimum',
      { ...validSettings, inputs: { ...validSettings.inputs, proteinGramsPerKg: 1.59 } },
    ],
    [
      'protein above maximum',
      { ...validSettings, inputs: { ...validSettings.inputs, proteinGramsPerKg: 2.21 } },
    ],
    [
      'fat ratio below minimum',
      { ...validSettings, inputs: { ...validSettings.inputs, fatCalorieRatio: 0.14 } },
    ],
    [
      'fat ratio above maximum',
      { ...validSettings, inputs: { ...validSettings.inputs, fatCalorieRatio: 0.41 } },
    ],
    [
      'surplus ratio below minimum',
      { ...validSettings, inputs: { ...validSettings.inputs, surplusRatio: -0.01 } },
    ],
    [
      'surplus ratio above maximum',
      { ...validSettings, inputs: { ...validSettings.inputs, surplusRatio: 0.31 } },
    ],
    ['training days below minimum', { ...validSettings, trainingDaysPerWeek: -1 }],
    ['training days above maximum', { ...validSettings, trainingDaysPerWeek: 8 }],
    ['fractional training days', { ...validSettings, trainingDaysPerWeek: 2.5 }],
    ['invalid activity level', { ...validSettings, inputs: { ...validSettings.inputs, activityLevel: 'extreme' } }],
    ['invalid training experience', { ...validSettings, trainingExperience: 'expert' }],
  ])('rejects %s', (_label, value) => {
    expect(() => profileSettingsSchema.parse(value)).toThrow();
  });

  it.each([
    ['minimum boundaries', 18, 100, 30, 1.6, 0.15, 0, 0, 'sedentary', 'beginner'],
    ['maximum boundaries', 100, 250, 350, 2.2, 0.4, 0.3, 7, 'veryHigh', 'advanced'],
  ] as const)(
    'accepts %s',
    (
      _label,
      age,
      heightCm,
      weightKg,
      proteinGramsPerKg,
      fatCalorieRatio,
      surplusRatio,
      trainingDaysPerWeek,
      activityLevel,
      trainingExperience,
    ) => {
      expect(
        profileSettingsSchema.parse({
          ...validSettings,
          inputs: {
            ...validSettings.inputs,
            age,
            heightCm,
            weightKg,
            proteinGramsPerKg,
            fatCalorieRatio,
            surplusRatio,
            activityLevel,
          },
          trainingDaysPerWeek,
          trainingExperience,
        }),
      ).toBeDefined();
    },
  );
});

describe('meal contracts', () => {
  const nutrition = {
    caloriesKcal: 600.5,
    proteinGrams: 35.2,
    fatGrams: 18,
    carbsGrams: 72.3,
  } as const;

  const validCreateMealInput = {
    mealDate: '2026-07-14',
    name: '鸡胸肉饭',
    amount: '一份',
    nutrition,
  } as const;

  it('accepts decimal nutrition totals and meal payloads', () => {
    expect(mealNutritionTotalsSchema.parse(nutrition)).toEqual(nutrition);
    expect(createMealInputSchema.parse(validCreateMealInput)).toEqual(validCreateMealInput);
    expect(
      mealEntrySchema.parse({
        id: 'meal-1',
        ...validCreateMealInput,
        createdAt: '2026-07-14T12:00:00.000Z',
        updatedAt: '2026-07-14T12:00:00.000Z',
      }),
    ).toBeDefined();
    expect(updateMealInputSchema.parse({ id: 'meal-1', ...validCreateMealInput })).toEqual({
      id: 'meal-1',
      ...validCreateMealInput,
    });
    expect([createMealInputKeepsNutritionShape, updateMealInputKeepsMealId]).toEqual([true, true]);
  });

  it.each([
    [
      'negative nutrition numbers',
      { ...validCreateMealInput, nutrition: { ...nutrition, caloriesKcal: -1 } },
    ],
    ['empty meal name', { ...validCreateMealInput, name: '' }],
    ['invalid YYYY-MM-DD meal date', { ...validCreateMealInput, mealDate: '2026-7-14' }],
    ['unknown extra keys', { ...validCreateMealInput, note: 'extra' }],
  ])('rejects %s', (_label, value) => {
    expect(() => createMealInputSchema.parse(value)).toThrow();
  });
});

describe('weight contracts', () => {
  const validCreateWeightInput = {
    entryDate: '2026-07-14',
    weightKg: 70.4,
    note: '晨重',
  } as const;

  it('accepts decimal weight entries and preserves DTO shape', () => {
    expect(createWeightEntryInputSchema.parse(validCreateWeightInput)).toEqual(validCreateWeightInput);
    expect(updateWeightEntryInputSchema.parse({ id: 'weight-1', ...validCreateWeightInput })).toEqual({
      id: 'weight-1',
      ...validCreateWeightInput,
    });
    expect(
      weightEntrySchema.parse({
        id: 'weight-1',
        ...validCreateWeightInput,
        createdAt: '2026-07-14T12:00:00.000Z',
        updatedAt: '2026-07-14T12:00:00.000Z',
      }),
    ).toBeDefined();
    expect([createWeightInputKeepsDate, updateWeightInputKeepsId]).toEqual([true, true]);
  });

  it.each([
    ['invalid date', { ...validCreateWeightInput, entryDate: '2026-7-14' }],
    ['weight below minimum', { ...validCreateWeightInput, weightKg: 29.99 }],
    ['weight above maximum', { ...validCreateWeightInput, weightKg: 350.01 }],
    ['negative weight', { ...validCreateWeightInput, weightKg: -1 }],
    ['note too long', { ...validCreateWeightInput, note: 'x'.repeat(501) }],
    ['unknown extra keys', { ...validCreateWeightInput, source: 'scale' }],
  ])('rejects %s', (_label, value) => {
    expect(() => createWeightEntryInputSchema.parse(value)).toThrow();
  });
});
