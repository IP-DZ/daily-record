import { describe, expect, it, vi } from 'vitest';

import type {
  MealEntry,
  PhotoMealAnalysis,
  PhotoMealCandidate,
  PreparedMealPhoto,
} from '@daily-record/contracts';
import { PhotoMealAnalysisRepositoryError } from '../photoMeal';
import { CloudBasePhotoMealAnalysisRepository } from './CloudBasePhotoMealAnalysisRepository';

const mealDate = '2026-07-14';
const nutrition = {
  caloriesKcal: 520,
  proteinGrams: 28,
  fatGrams: 18,
  carbsGrams: 62,
};
const candidate: PhotoMealCandidate = {
  id: 'candidate-1',
  name: '番茄炒蛋盖饭',
  estimatedGrams: 320,
  cookingMethod: '炒',
  nutrition,
  confidence: 0.82,
  questions: [],
};
const analysis: PhotoMealAnalysis = {
  id: 'analysis-1',
  mealDate,
  requestId: 'request-1',
  status: 'needs-confirmation',
  candidates: [candidate],
  overallConfidence: 0.82,
  questions: [],
  imageObjectKey: 'users/user-hash/meals/analysis-1/photo.webp',
  errorCode: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};
const photo: PreparedMealPhoto = {
  dataUrl: 'data:image/webp;base64,AAAA',
  mimeType: 'image/webp',
  sizeBytes: 120_000,
  width: 1200,
  height: 900,
  originalName: 'lunch.webp',
};
const meal: MealEntry = {
  id: 'meal-1',
  mealDate,
  name: '番茄炒蛋盖饭',
  amount: '320克，炒',
  nutrition,
  createdAt: '2026-07-14T12:01:00.000Z',
  updatedAt: '2026-07-14T12:01:00.000Z',
};

describe('CloudBasePhotoMealAnalysisRepository', () => {
  it('calls the mealPhotoAnalysis cloud function with validated commands and parses responses', async () => {
    const confirmed = { ...analysis, status: 'confirmed' as const };
    const callFunction = vi.fn()
      .mockResolvedValueOnce({ result: analysis })
      .mockResolvedValueOnce({ result: analysis })
      .mockResolvedValueOnce({ result: { analysis: confirmed, meals: [meal] } })
      .mockResolvedValueOnce({ result: null });
    const repository = new CloudBasePhotoMealAnalysisRepository({ callFunction });

    await expect(repository.create({ mealDate, requestId: 'request-1', photo }))
      .resolves.toEqual(analysis);
    await expect(repository.get(analysis.id)).resolves.toEqual(analysis);
    await expect(repository.confirm({ analysisId: analysis.id, mealDate, items: [candidate] }))
      .resolves.toEqual([meal]);
    await expect(repository.discard(analysis.id)).resolves.toBeUndefined();

    expect(callFunction).toHaveBeenNthCalledWith(1, {
      name: 'mealPhotoAnalysis',
      data: {
        action: 'create',
        payload: { mealDate, requestId: 'request-1', photo },
      },
    });
    expect(callFunction).toHaveBeenNthCalledWith(2, {
      name: 'mealPhotoAnalysis',
      data: {
        action: 'get',
        payload: { analysisId: analysis.id },
      },
    });
    expect(callFunction).toHaveBeenNthCalledWith(3, {
      name: 'mealPhotoAnalysis',
      data: {
        action: 'confirm',
        payload: { analysisId: analysis.id, mealDate, items: [candidate] },
      },
    });
    expect(callFunction).toHaveBeenNthCalledWith(4, {
      name: 'mealPhotoAnalysis',
      data: {
        action: 'discard',
        payload: { analysisId: analysis.id },
      },
    });
    expect(JSON.stringify(callFunction.mock.calls)).not.toMatch(/userId|user_id|email|secret|apiKey/i);
  });

  it.each([
    ['provider error', { result: null, error: { message: 'private provider detail' } }],
    ['invalid analysis response', { result: { ...analysis, imageObjectKey: 'https://example.com/photo.webp' } }],
  ])('maps %s to a stable safe photo meal error', async (_case, response) => {
    const repository = new CloudBasePhotoMealAnalysisRepository({
      callFunction: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.create({ mealDate, requestId: 'request-1', photo })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(PhotoMealAnalysisRepositoryError);
    expect(error).toMatchObject({
      code: 'photo-meal/unavailable',
      message: 'Photo meal analysis is unavailable',
    });
    expect(String(error)).not.toContain('private provider detail');
    expect(String(error)).not.toContain('https://example.com/photo.webp');
  });

  it('maps rejected provider calls without exposing provider details', async () => {
    const repository = new CloudBasePhotoMealAnalysisRepository({
      callFunction: vi.fn().mockRejectedValue(new Error('private model stack trace')),
    });

    await expect(repository.get(analysis.id)).rejects.toMatchObject({
      code: 'photo-meal/unavailable',
      message: 'Photo meal analysis is unavailable',
    });
  });
});
