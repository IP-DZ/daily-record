import { describe, expect, it } from 'vitest';

import {
  confirmPhotoMealAnalysisInputSchema,
  createPhotoMealAnalysisInputSchema,
  photoMealAnalysisSchema,
  photoMealCandidateSchema,
  preparedMealPhotoSchema,
} from './photoMeal';

const nutrition = {
  caloriesKcal: 520,
  proteinGrams: 28,
  fatGrams: 18,
  carbsGrams: 62,
};

const candidate = {
  id: 'candidate-1',
  name: '番茄炒蛋盖饭',
  estimatedGrams: 320,
  cookingMethod: '炒',
  nutrition,
  confidence: 0.82,
  questions: ['米饭大约是一碗吗？'],
};

const photo = {
  dataUrl: 'data:image/webp;base64,AAAA',
  mimeType: 'image/webp',
  sizeBytes: 120_000,
  width: 1200,
  height: 900,
  originalName: 'lunch.jpg',
};

const analysis = {
  id: 'analysis-1',
  mealDate: '2026-07-14',
  requestId: 'request-1',
  status: 'needs-confirmation',
  candidates: [candidate],
  overallConfidence: 0.82,
  questions: ['请确认米饭分量。'],
  imageObjectKey: 'users/user-hash/meals/analysis-1/photo.webp',
  errorCode: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

describe('photo meal contracts', () => {
  it('accepts a strict editable photo meal analysis estimate', () => {
    expect(photoMealCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(photoMealAnalysisSchema.parse(analysis)).toEqual(analysis);
  });

  it('accepts create and confirm inputs without user-owned identity fields', () => {
    expect(createPhotoMealAnalysisInputSchema.parse({
      mealDate: '2026-07-14',
      requestId: 'request-1',
      photo,
    })).toEqual({
      mealDate: '2026-07-14',
      requestId: 'request-1',
      photo,
    });

    expect(confirmPhotoMealAnalysisInputSchema.parse({
      analysisId: 'analysis-1',
      mealDate: '2026-07-14',
      items: [candidate],
    })).toEqual({
      analysisId: 'analysis-1',
      mealDate: '2026-07-14',
      items: [candidate],
    });
  });

  it('accepts only compressed image data safe for a cloud function request', () => {
    expect(preparedMealPhotoSchema.parse(photo)).toEqual(photo);
  });

  it.each([
    ['extra user id on analysis', { ...analysis, userId: 'user-b' }, photoMealAnalysisSchema],
    ['bad meal date', { ...analysis, mealDate: '2026-7-14' }, photoMealAnalysisSchema],
    ['empty candidate name', { ...candidate, name: '' }, photoMealCandidateSchema],
    ['negative grams', { ...candidate, estimatedGrams: -1 }, photoMealCandidateSchema],
    ['negative nutrition', { ...candidate, nutrition: { ...nutrition, caloriesKcal: -1 } }, photoMealCandidateSchema],
    ['confidence above one', { ...candidate, confidence: 1.01 }, photoMealCandidateSchema],
    ['too many questions', { ...candidate, questions: ['1', '2', '3', '4', '5', '6'] }, photoMealCandidateSchema],
    ['public image url', { ...analysis, imageObjectKey: 'https://example.com/photo.webp' }, photoMealAnalysisSchema],
    ['oversized prepared photo', { ...photo, sizeBytes: 1_500_001 }, preparedMealPhotoSchema],
    ['non-image data url', { ...photo, dataUrl: 'data:text/plain;base64,AAAA' }, preparedMealPhotoSchema],
    ['mismatched image data url mime type', { ...photo, dataUrl: 'data:image/jpeg;base64,AAAA' }, preparedMealPhotoSchema],
    ['extra user id on create', { mealDate: '2026-07-14', requestId: 'request-1', photo, userId: 'user-b' }, createPhotoMealAnalysisInputSchema],
    ['empty confirm items', { analysisId: 'analysis-1', mealDate: '2026-07-14', items: [] }, confirmPhotoMealAnalysisInputSchema],
  ])('rejects %s', (_caseName, value, schema) => {
    expect(() => schema.parse(value)).toThrow();
  });
});
