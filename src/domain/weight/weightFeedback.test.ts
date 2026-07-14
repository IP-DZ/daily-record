import { describe, expect, it } from 'vitest';

import type { WeightEntry } from '@daily-record/contracts';
import { calculateWeightFeedback } from './weightFeedback';

function weightEntry(id: string, entryDate: string, weightKg: number): WeightEntry {
  return {
    id,
    entryDate,
    weightKg,
    note: '',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

describe('calculateWeightFeedback', () => {
  it('returns insufficient-data until there are at least 8 entries spanning 21 days', () => {
    expect(calculateWeightFeedback([
      weightEntry('w1', '2026-07-01', 70),
      weightEntry('w2', '2026-07-02', 70.1),
      weightEntry('w3', '2026-07-03', 70.2),
      weightEntry('w4', '2026-07-04', 70.3),
      weightEntry('w5', '2026-07-05', 70.4),
      weightEntry('w6', '2026-07-06', 70.5),
      weightEntry('w7', '2026-07-07', 70.6),
    ], 70)).toEqual({
      status: 'insufficient-data',
      deltaCaloriesKcal: 0,
      weeklyChangeKg: null,
      targetWeeklyGainKg: 0.175,
    });
  });

  it('suggests increasing calories when weekly gain is below half target', () => {
    expect(calculateWeightFeedback([
      weightEntry('w1', '2026-07-01', 70),
      weightEntry('w2', '2026-07-02', 70.1),
      weightEntry('w3', '2026-07-03', 70.1),
      weightEntry('w4', '2026-07-04', 70.2),
      weightEntry('w5', '2026-07-05', 70.2),
      weightEntry('w6', '2026-07-06', 70.3),
      weightEntry('w7', '2026-07-07', 70.3),
      weightEntry('w8', '2026-07-22', 70.2),
      weightEntry('w9', '2026-07-23', 70.2),
      weightEntry('w10', '2026-07-24', 70.3),
      weightEntry('w11', '2026-07-25', 70.3),
      weightEntry('w12', '2026-07-26', 70.4),
      weightEntry('w13', '2026-07-27', 70.4),
      weightEntry('w14', '2026-07-28', 70.5),
    ], 70)).toMatchObject({
      status: 'increase-calories',
      deltaCaloriesKcal: 100,
      targetWeeklyGainKg: 0.175,
    });
  });

  it('suggests decreasing calories when weekly gain is above one and a half times target', () => {
    expect(calculateWeightFeedback([
      weightEntry('w1', '2026-07-01', 70),
      weightEntry('w2', '2026-07-02', 70),
      weightEntry('w3', '2026-07-03', 70.1),
      weightEntry('w4', '2026-07-04', 70.1),
      weightEntry('w5', '2026-07-05', 70.1),
      weightEntry('w6', '2026-07-06', 70.2),
      weightEntry('w7', '2026-07-07', 70.2),
      weightEntry('w8', '2026-07-22', 71),
      weightEntry('w9', '2026-07-23', 71.1),
      weightEntry('w10', '2026-07-24', 71.1),
      weightEntry('w11', '2026-07-25', 71.2),
      weightEntry('w12', '2026-07-26', 71.2),
      weightEntry('w13', '2026-07-27', 71.3),
      weightEntry('w14', '2026-07-28', 71.3),
    ], 70)).toMatchObject({
      status: 'decrease-calories',
      deltaCaloriesKcal: -100,
    });
  });

  it('suggests maintaining calories when weekly gain is in target range', () => {
    expect(calculateWeightFeedback([
      weightEntry('w1', '2026-07-01', 70),
      weightEntry('w2', '2026-07-02', 70.1),
      weightEntry('w3', '2026-07-03', 70.1),
      weightEntry('w4', '2026-07-04', 70.2),
      weightEntry('w5', '2026-07-05', 70.2),
      weightEntry('w6', '2026-07-06', 70.3),
      weightEntry('w7', '2026-07-07', 70.3),
      weightEntry('w8', '2026-07-22', 70.6),
      weightEntry('w9', '2026-07-23', 70.7),
      weightEntry('w10', '2026-07-24', 70.7),
      weightEntry('w11', '2026-07-25', 70.8),
      weightEntry('w12', '2026-07-26', 70.8),
      weightEntry('w13', '2026-07-27', 70.9),
      weightEntry('w14', '2026-07-28', 70.9),
    ], 70)).toMatchObject({
      status: 'maintain',
      deltaCaloriesKcal: 0,
    });
  });
});
