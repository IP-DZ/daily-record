import { describe, expect, it, vi } from 'vitest';

import type { PhotoMealCandidate, PreparedMealPhoto } from '@daily-record/contracts';
import {
  createHttpJsonMealPhotoAnalysisModelClient,
  createObjectStorageMealPhotoStorage,
  createRpcMealPhotoAnalysisDatabaseGateway,
  loadMealPhotoRuntimeConfig,
} from './runtime';
import {
  createMealPhotoAnalysisCloudFunction as createEntrypointFunction,
  createMealPhotoAnalysisHandler as createEntrypointHandler,
} from './index';

const photo: PreparedMealPhoto = {
  dataUrl: 'data:image/webp;base64,QUJDRA==',
  mimeType: 'image/webp',
  sizeBytes: 4,
  width: 1200,
  height: 900,
  originalName: '午餐.webp',
};

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

const analysis = {
  id: 'analysis-1',
  mealDate: '2026-07-14',
  requestId: 'request-1',
  status: 'needs-confirmation',
  candidates: [candidate],
  overallConfidence: 0.82,
  questions: [],
  imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
  errorCode: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
} as const;

describe('meal photo cloud function runtime adapters', () => {
  it('exposes a package entrypoint for CloudBase deployment wiring', () => {
    expect(createEntrypointFunction).toBeTypeOf('function');
    expect(createEntrypointHandler).toBeTypeOf('function');
  });

  it('loads only server-side model configuration and validates daily limits', () => {
    const config = loadMealPhotoRuntimeConfig({
      PHOTO_MEAL_MODEL_PROVIDER: 'http-json',
      PHOTO_MEAL_MODEL_ENDPOINT: 'https://model.example.test/v1/chat/completions',
      PHOTO_MEAL_MODEL_API_KEY: 'server-only-secret',
      PHOTO_MEAL_MODEL_NAME: 'vision-food-v1',
      PHOTO_MEAL_DAILY_LIMIT: '7',
    });

    expect(config).toEqual({
      model: {
        provider: 'http-json',
        endpoint: 'https://model.example.test/v1/chat/completions',
        apiKey: 'server-only-secret',
        modelName: 'vision-food-v1',
      },
      dailyLimit: 7,
    });
    expect(() => loadMealPhotoRuntimeConfig({
      PHOTO_MEAL_MODEL_PROVIDER: 'http-json',
      PHOTO_MEAL_MODEL_ENDPOINT: 'https://model.example.test/v1/chat/completions',
      PHOTO_MEAL_MODEL_NAME: 'vision-food-v1',
      PHOTO_MEAL_DAILY_LIMIT: '0',
    })).toThrow(/invalid meal photo runtime config/i);
  });

  it('posts compressed photos to an OpenAI-compatible JSON vision endpoint without leaking object keys', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              candidates: [candidate],
              overallConfidence: 0.82,
              questions: ['如果有米饭重量，请手动修正。'],
            }),
          },
        }],
      }),
    });
    const client = createHttpJsonMealPhotoAnalysisModelClient({
      provider: 'http-json',
      endpoint: 'https://model.example.test/v1/chat/completions',
      apiKey: 'server-only-secret',
      modelName: 'vision-food-v1',
    }, fetch);

    await expect(client.analyzeMealPhoto({
      imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
      photo,
    })).resolves.toEqual({
      candidates: [candidate],
      overallConfidence: 0.82,
      questions: ['如果有米饭重量，请手动修正。'],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://model.example.test/v1/chat/completions');
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer server-only-secret',
      'Content-Type': 'application/json',
    }));
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      model: 'vision-food-v1',
      response_format: { type: 'json_object' },
    }));
    expect(JSON.stringify(body)).toContain(photo.dataUrl);
    expect(JSON.stringify(body)).not.toContain('users/user-a/photo-meal/request-1/photo.webp');
  });

  it('saves photos to private per-user object keys without storing data URLs or raw user ids in paths', async () => {
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    const storage = createObjectStorageMealPhotoStorage({ uploadFile });

    const objectKey = await storage.saveMealPhoto({
      userId: 'user/a?bad',
      requestId: 'request 1/../x',
      photo,
    });
    const secondObjectKey = await storage.saveMealPhoto({
      userId: 'user-a-bad',
      requestId: 'request 1/../x',
      photo,
    });

    expect(objectKey).toMatch(/^users\/[A-Za-z0-9_-]{32}\/photo-meal\/[A-Za-z0-9_-]{32}\/photo\.webp$/);
    expect(secondObjectKey).not.toBe(objectKey);
    expect(uploadFile).toHaveBeenNthCalledWith(1, {
      cloudPath: objectKey,
      fileContent: Buffer.from('QUJDRA==', 'base64'),
      contentType: 'image/webp',
    });
    expect(objectKey).not.toContain('data:image');
    expect(objectKey).not.toContain('user-a-bad');
    expect(JSON.stringify(uploadFile.mock.calls)).not.toContain(photo.dataUrl);
  });

  it('maps handler database actions to authenticated RPC calls without user id parameters', async () => {
    const rdb = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: 3 })
        .mockResolvedValueOnce({ data: analysis })
        .mockResolvedValueOnce({ data: analysis })
        .mockResolvedValueOnce({ data: { analysis: { ...analysis, status: 'confirmed' }, meals: [] } })
        .mockResolvedValueOnce({ data: { ...analysis, status: 'discarded' } }),
    };
    const database = createRpcMealPhotoAnalysisDatabaseGateway(rdb);

    await expect(database.countCreatedToday({ userId: 'user-a', date: '2026-07-14' })).resolves.toBe(3);
    await database.create({
      userId: 'user-a',
      payload: {
        mealDate: '2026-07-14',
        requestId: 'request-1',
        imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
        candidates: [candidate],
        overallConfidence: 0.82,
        questions: [],
        errorCode: null,
      },
    });
    await database.get({ userId: 'user-a', analysisId: 'analysis-1' });
    await database.confirm({
      userId: 'user-a',
      payload: { analysisId: 'analysis-1', mealDate: '2026-07-14', items: [candidate] },
    });
    await database.discard({ userId: 'user-a', analysisId: 'analysis-1' });

    expect(rdb.rpc.mock.calls).toEqual([
      ['count_my_photo_meal_analyses_by_date', { analysis_date: '2026-07-14' }],
      ['create_my_photo_meal_analysis', {
        payload: {
          mealDate: '2026-07-14',
          requestId: 'request-1',
          imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
          candidates: [candidate],
          overallConfidence: 0.82,
          questions: [],
          errorCode: null,
        },
      }],
      ['get_my_photo_meal_analysis', { analysis_id: 'analysis-1' }],
      ['confirm_my_photo_meal_analysis', {
        analysis_id: 'analysis-1',
        meal_date: '2026-07-14',
        items: [candidate],
      }],
      ['discard_my_photo_meal_analysis', { analysis_id: 'analysis-1' }],
    ]);
    expect(JSON.stringify(rdb.rpc.mock.calls)).not.toMatch(/userId|user_id|email|apiKey|secret/i);
  });
});
