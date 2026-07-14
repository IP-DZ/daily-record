import { describe, expect, it } from 'vitest';

import { nutritionGoalVersionSchema } from './nutritionGoals';

const targets = {
  restingKcal: 1700,
  maintenanceKcal: 2600,
  caloriesKcal: 2860,
  proteinGrams: 140,
  fatGrams: 79,
  carbsGrams: 390,
};

const goalVersion = {
  version: 2,
  effectiveDate: '2026-07-14',
  targets,
  createdAt: '2026-07-14T08:00:00.000Z',
};

describe('nutrition goal contracts', () => {
  it('accepts a strict nutrition goal version without user-owned identity fields', () => {
    expect(nutritionGoalVersionSchema.parse(goalVersion)).toEqual(goalVersion);
  });

  it.each([
    ['extra user id', { ...goalVersion, userId: 'user-a' }],
    ['non-integer version', { ...goalVersion, version: 1.5 }],
    ['zero version', { ...goalVersion, version: 0 }],
    ['bad effective date', { ...goalVersion, effectiveDate: '2026-7-14' }],
    ['negative target', { ...goalVersion, targets: { ...targets, caloriesKcal: -1 } }],
    ['non-finite target', { ...goalVersion, targets: { ...targets, proteinGrams: Number.POSITIVE_INFINITY } }],
    ['extra target key', { ...goalVersion, targets: { ...targets, sodiumMg: 100 } }],
    ['empty createdAt', { ...goalVersion, createdAt: '' }],
  ])('rejects %s', (_caseName, value) => {
    expect(() => nutritionGoalVersionSchema.parse(value)).toThrow();
  });
});
