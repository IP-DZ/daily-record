import { describe, expect, it } from 'vitest';

import type {
  NutritionInputs as AppNutritionInputs,
  NutritionTargets as AppNutritionTargets,
} from '../../../src/domain/nutrition/types';
import type { OnboardingDraftInput } from '../../../src/platform/settings/onboardingTypes';
import profileSettingsSource from './profileSettings.ts?raw';
import {
  authUserSchema,
  emailCodeSchema,
  emailSchema,
  profileSettingsSchema,
} from './index';
import type {
  NutritionInputs,
  NutritionTargets,
  ProfileSettingsDraft,
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
