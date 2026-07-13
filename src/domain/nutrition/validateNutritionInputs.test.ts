import { describe, expect, it } from 'vitest';

import type { NutritionInputs } from './types';
import { nutritionInputsSchema } from './validateNutritionInputs';

const validInput = {
  age: 30,
  sex: 'male',
  heightCm: 175,
  weightKg: 70,
  activityLevel: 'moderate',
  proteinGramsPerKg: 1.8,
  fatCalorieRatio: 0.25,
  surplusRatio: 0.1,
} satisfies NutritionInputs;

describe('nutritionInputsSchema', () => {
  it('accepts a valid complete input', () => {
    expect(nutritionInputsSchema.parse(validInput)).toEqual(validInput);
  });

  it('rejects ages below the adult minimum', () => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, age: 17 })).toThrow();
  });

  it('rejects non-positive height and weight', () => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, heightCm: 0 })).toThrow();
    expect(() => nutritionInputsSchema.parse({ ...validInput, weightKg: 0 })).toThrow();
  });

  it('rejects protein targets outside the accepted range', () => {
    expect(() =>
      nutritionInputsSchema.parse({ ...validInput, proteinGramsPerKg: 1.5 }),
    ).toThrow();
    expect(() =>
      nutritionInputsSchema.parse({ ...validInput, proteinGramsPerKg: 2.3 }),
    ).toThrow();
  });

  it('rejects a non-positive fat ratio', () => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, fatCalorieRatio: 0 })).toThrow();
  });

  it('rejects inputs whose calculated carbohydrate target is negative', () => {
    expect(() =>
      nutritionInputsSchema.parse({
        ...validInput,
        age: 100,
        sex: 'female',
        heightCm: 100,
        weightKg: 350,
        activityLevel: 'sedentary',
        proteinGramsPerKg: 2.2,
        fatCalorieRatio: 0.4,
        surplusRatio: 0,
      }),
    ).toThrow('碳水目标不能为负数');
  });

  it('rejects inputs without sex instead of automatically calculating', () => {
    const inputWithoutSex: Partial<NutritionInputs> = { ...validInput };
    delete inputWithoutSex.sex;

    expect(() => nutritionInputsSchema.parse(inputWithoutSex)).toThrow();
  });

  it.each([
    ['age', 18, 100],
    ['heightCm', 100, 250],
    ['weightKg', 30, 350],
    ['proteinGramsPerKg', 1.6, 2.2],
    ['fatCalorieRatio', 0.15, 0.4],
    ['surplusRatio', 0, 0.3],
  ] as const)('accepts the exact %s minimum and maximum', (field, minimum, maximum) => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, [field]: minimum })).not.toThrow();
    expect(() => nutritionInputsSchema.parse({ ...validInput, [field]: maximum })).not.toThrow();
  });

  it.each([
    ['age', 17, 101],
    ['heightCm', 99.99, 250.01],
    ['weightKg', 29.99, 350.01],
    ['proteinGramsPerKg', 1.599, 2.201],
    ['fatCalorieRatio', 0.149, 0.401],
    ['surplusRatio', -0.001, 0.301],
  ] as const)('rejects values just outside the %s range', (field, below, above) => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, [field]: below })).toThrow();
    expect(() => nutritionInputsSchema.parse({ ...validInput, [field]: above })).toThrow();
  });

  it('rejects a non-integer age', () => {
    expect(() => nutritionInputsSchema.parse({ ...validInput, age: 30.5 })).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite numeric input %s',
    (value) => {
      for (const field of [
        'age',
        'heightCm',
        'weightKg',
        'proteinGramsPerKg',
        'fatCalorieRatio',
        'surplusRatio',
      ] as const) {
        expect(() => nutritionInputsSchema.parse({ ...validInput, [field]: value })).toThrow();
      }
    },
  );
});
