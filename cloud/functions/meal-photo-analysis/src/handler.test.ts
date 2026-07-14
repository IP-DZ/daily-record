import { describe, expect, it, vi } from 'vitest';

import type {
  CreatePhotoMealAnalysisInput,
  PhotoMealAnalysis,
  PhotoMealCandidate,
} from '@daily-record/contracts';
import {
  createMealPhotoAnalysisHandler,
  type MealPhotoAnalysisDatabaseGateway,
  type MealPhotoAnalysisHandlerEvent,
} from './handler';

const mealDate = '2026-07-14';
const candidate: PhotoMealCandidate = {
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
const createInput: CreatePhotoMealAnalysisInput = {
  mealDate,
  requestId: 'request-1',
  photo: {
    dataUrl: 'data:image/webp;base64,AAAA',
    mimeType: 'image/webp',
    sizeBytes: 120_000,
    width: 1200,
    height: 900,
    originalName: 'lunch.webp',
  },
};
const analysis: PhotoMealAnalysis = {
  id: 'analysis-1',
  mealDate,
  requestId: 'request-1',
  status: 'needs-confirmation',
  candidates: [candidate],
  overallConfidence: 0.82,
  questions: [],
  imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
  errorCode: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

function event(payload: unknown, userId = 'user-a'): MealPhotoAnalysisHandlerEvent {
  return {
    action: 'create',
    auth: { uid: userId },
    payload,
  };
}

function createDatabase(overrides: Partial<MealPhotoAnalysisDatabaseGateway> = {}): MealPhotoAnalysisDatabaseGateway {
  return {
    countCreatedToday: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(analysis),
    get: vi.fn().mockResolvedValue(analysis),
    confirm: vi.fn().mockResolvedValue({ analysis: { ...analysis, status: 'confirmed' }, meals: [] }),
    discard: vi.fn().mockResolvedValue({ ...analysis, status: 'discarded' }),
    ...overrides,
  };
}

describe('meal-photo-analysis handler', () => {
  it('saves the compressed photo, calls the model, and stores a safe analysis estimate', async () => {
    const storage = {
      saveMealPhoto: vi.fn().mockResolvedValue('users/user-a/photo-meal/request-1/photo.webp'),
    };
    const modelClient = {
      analyzeMealPhoto: vi.fn().mockResolvedValue({
        candidates: [candidate],
        overallConfidence: 0.82,
        questions: [],
      }),
    };
    const database = createDatabase();
    const handler = createMealPhotoAnalysisHandler({
      storage,
      modelClient,
      database,
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      dailyLimit: 20,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await expect(handler(event(createInput))).resolves.toEqual(analysis);

    expect(storage.saveMealPhoto).toHaveBeenCalledWith({
      userId: 'user-a',
      requestId: 'request-1',
      photo: createInput.photo,
    });
    expect(modelClient.analyzeMealPhoto).toHaveBeenCalledWith({
      imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
      photo: createInput.photo,
    });
    expect(database.create).toHaveBeenCalledWith({
      userId: 'user-a',
      payload: {
        mealDate,
        requestId: 'request-1',
        imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
        candidates: [candidate],
        overallConfidence: 0.82,
        questions: [],
        errorCode: null,
      },
    });
  });

  it('retries once after invalid model JSON and stores a failed safe analysis if retry still fails', async () => {
    const storage = {
      saveMealPhoto: vi.fn().mockResolvedValue('users/user-a/photo-meal/request-1/photo.webp'),
    };
    const modelClient = {
      analyzeMealPhoto: vi.fn()
        .mockResolvedValueOnce({ candidates: [{ ...candidate, confidence: 2 }], overallConfidence: 2, questions: [] })
        .mockRejectedValueOnce(new Error('provider stack trace with api key')),
    };
    const failedAnalysis = { ...analysis, status: 'failed' as const, candidates: [], overallConfidence: 0, errorCode: 'model_failed' };
    const database = createDatabase({ create: vi.fn().mockResolvedValue(failedAnalysis) });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handler = createMealPhotoAnalysisHandler({
      storage,
      modelClient,
      database,
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      logger,
    });

    await expect(handler(event(createInput))).resolves.toEqual(failedAnalysis);

    expect(modelClient.analyzeMealPhoto).toHaveBeenCalledTimes(2);
    expect(database.create).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        candidates: [],
        overallConfidence: 0,
        errorCode: 'model_failed',
      }),
    }));
    expect(JSON.stringify(logger)).not.toContain('api key');
  });

  it('rejects unauthenticated and over-limit create requests without saving the photo', async () => {
    const storage = { saveMealPhoto: vi.fn() };
    const database = createDatabase({ countCreatedToday: vi.fn().mockResolvedValue(20) });
    const handler = createMealPhotoAnalysisHandler({
      storage,
      modelClient: { analyzeMealPhoto: vi.fn() },
      database,
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      dailyLimit: 20,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await expect(handler({ action: 'create', payload: createInput })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(handler(event(createInput))).rejects.toMatchObject({
      code: 'daily_limit_exceeded',
    });
    expect(storage.saveMealPhoto).not.toHaveBeenCalled();
  });

  it('delegates get, confirm, and discard actions without accepting client user identity', async () => {
    const database = createDatabase();
    const handler = createMealPhotoAnalysisHandler({
      storage: { saveMealPhoto: vi.fn() },
      modelClient: { analyzeMealPhoto: vi.fn() },
      database,
      clock: () => new Date('2026-07-14T12:00:00.000Z'),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await handler({ action: 'get', auth: { uid: 'user-a' }, payload: { analysisId: 'analysis-1', userId: 'user-b' } });
    await handler({
      action: 'confirm',
      auth: { uid: 'user-a' },
      payload: { analysisId: 'analysis-1', mealDate, items: [candidate], userId: 'user-b' },
    });
    await handler({ action: 'discard', auth: { uid: 'user-a' }, payload: { analysisId: 'analysis-1', userId: 'user-b' } });

    expect(database.get).toHaveBeenCalledWith({ userId: 'user-a', analysisId: 'analysis-1' });
    expect(database.confirm).toHaveBeenCalledWith({
      userId: 'user-a',
      payload: { analysisId: 'analysis-1', mealDate, items: [candidate] },
    });
    expect(database.discard).toHaveBeenCalledWith({ userId: 'user-a', analysisId: 'analysis-1' });
  });
});
