import { describe, expect, it } from 'vitest';

import type { PhotoMealAnalysis, PhotoMealCandidate } from '@daily-record/contracts';

import {
  analysisNeedsUserInput,
  calculateCandidateTotals,
  candidateToMealInput,
} from './photoMealAnalysis';

const confidentCandidate: PhotoMealCandidate = {
  id: 'candidate-1',
  name: '番茄炒蛋盖饭',
  estimatedGrams: 320,
  cookingMethod: '炒',
  nutrition: {
    caloriesKcal: 520,
    proteinGrams: 28,
    fatGrams: 18,
    carbsGrams: 62,
  },
  confidence: 0.82,
  questions: [],
};

function analysis(overrides: Partial<PhotoMealAnalysis> = {}): PhotoMealAnalysis {
  return {
    id: 'analysis-1',
    mealDate: '2026-07-14',
    requestId: 'request-1',
    status: 'needs-confirmation',
    candidates: [confidentCandidate],
    overallConfidence: 0.82,
    questions: [],
    imageObjectKey: 'users/user-hash/meals/analysis-1/photo.webp',
    errorCode: null,
    createdAt: '2026-07-14T12:00:00.000Z',
    updatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('photo meal analysis domain', () => {
  it('sums candidate nutrition without rounding decimals', () => {
    expect(calculateCandidateTotals([
      confidentCandidate,
      {
        ...confidentCandidate,
        id: 'candidate-2',
        nutrition: {
          caloriesKcal: 100.5,
          proteinGrams: 6.2,
          fatGrams: 3.5,
          carbsGrams: 12.25,
        },
      },
    ])).toEqual({
      caloriesKcal: 620.5,
      proteinGrams: 34.2,
      fatGrams: 21.5,
      carbsGrams: 74.25,
    });
  });

  it('flags low confidence or model questions as requiring user input', () => {
    expect(analysisNeedsUserInput(analysis())).toBe(false);
    expect(analysisNeedsUserInput(analysis({ overallConfidence: 0.69 }))).toBe(true);
    expect(analysisNeedsUserInput(analysis({ questions: ['请确认用油量。'] }))).toBe(true);
    expect(analysisNeedsUserInput(analysis({
      candidates: [{ ...confidentCandidate, confidence: 0.69 }],
    }))).toBe(true);
  });

  it('maps an editable candidate to the existing meal input shape', () => {
    expect(candidateToMealInput(confidentCandidate, '2026-07-14')).toEqual({
      mealDate: '2026-07-14',
      name: '番茄炒蛋盖饭',
      amount: '320克，炒',
      nutrition: confidentCandidate.nutrition,
    });
  });

  it('omits the cooking method from amount when it is unknown', () => {
    expect(candidateToMealInput({
      ...confidentCandidate,
      cookingMethod: '',
    }, '2026-07-14')).toMatchObject({
      amount: '320克',
    });
  });
});
