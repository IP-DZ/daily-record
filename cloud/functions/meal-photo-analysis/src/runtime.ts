import { createHash } from 'node:crypto';

import {
  confirmPhotoMealAnalysisResultSchema,
  photoMealAnalysisSchema,
  type ConfirmPhotoMealAnalysisInput,
  type ConfirmPhotoMealAnalysisResult,
  type PhotoMealAnalysis,
  type PreparedMealPhoto,
} from '@daily-record/contracts';

import {
  createMealPhotoAnalysisHandler,
  type MealPhotoAnalysisDatabaseGateway,
  type MealPhotoAnalysisHandlerEvent,
  type MealPhotoAnalysisLogger,
  type MealPhotoAnalysisModelClient,
  type MealPhotoAnalysisStorage,
} from './handler';

type RuntimeEnv = Record<string, string | undefined>;

export interface HttpJsonMealPhotoModelConfig {
  provider: 'http-json';
  endpoint: string;
  apiKey: string;
  modelName: string;
}

export interface MealPhotoRuntimeConfig {
  model: HttpJsonMealPhotoModelConfig;
  dailyLimit: number;
}

export interface FetchResponseLike {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponseLike>;

export interface ObjectStorageUploadFileClient {
  uploadFile(input: {
    cloudPath: string;
    fileContent: Buffer;
    contentType: PreparedMealPhoto['mimeType'];
  }): Promise<unknown>;
}

type PhotoMealRpcName =
  | 'count_my_photo_meal_analyses_by_date'
  | 'create_my_photo_meal_analysis'
  | 'get_my_photo_meal_analysis'
  | 'confirm_my_photo_meal_analysis'
  | 'discard_my_photo_meal_analysis';

type PhotoMealRpcParameters =
  | { analysis_date: string }
  | { payload: PhotoMealAnalysisDatabaseGatewayCreatePayload }
  | { analysis_id: string }
  | { analysis_id: string; meal_date: string; items: ConfirmPhotoMealAnalysisInput['items'] };

interface PhotoMealAnalysisDatabaseGatewayCreatePayload {
  mealDate: string;
  requestId: string;
  imageObjectKey: string;
  candidates: unknown[];
  overallConfidence: number;
  questions: string[];
  errorCode: string | null;
}

export interface PhotoMealAnalysisRdbClient {
  rpc(
    name: PhotoMealRpcName,
    parameters: PhotoMealRpcParameters,
  ): Promise<{ data: unknown; error?: unknown }>;
}

export interface MealPhotoAnalysisCloudFunctionEvent {
  action?: MealPhotoAnalysisHandlerEvent['action'];
  data?: {
    action?: MealPhotoAnalysisHandlerEvent['action'];
    payload?: unknown;
  };
  payload?: unknown;
  auth?: {
    uid?: string | null;
  };
  context?: {
    uid?: string | null;
    userId?: string | null;
  };
}

export interface MealPhotoAnalysisCloudFunctionDependencies {
  env: RuntimeEnv;
  fetch: FetchLike;
  storage: ObjectStorageUploadFileClient;
  rdb: PhotoMealAnalysisRdbClient;
  clock?: () => Date;
  logger?: MealPhotoAnalysisLogger;
}

const safeLogger: MealPhotoAnalysisLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function requireString(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    throw new Error('Invalid meal photo runtime config');
  }
  return value.trim();
}

function parseDailyLimit(value: string | undefined): number {
  if (value == null || value.trim() === '') return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('Invalid meal photo runtime config');
  }
  return parsed;
}

export function loadMealPhotoRuntimeConfig(env: RuntimeEnv): MealPhotoRuntimeConfig {
  const provider = requireString(env.PHOTO_MEAL_MODEL_PROVIDER);
  if (provider !== 'http-json') {
    throw new Error('Invalid meal photo runtime config');
  }
  return {
    model: {
      provider,
      endpoint: requireString(env.PHOTO_MEAL_MODEL_ENDPOINT),
      apiKey: requireString(env.PHOTO_MEAL_MODEL_API_KEY),
      modelName: requireString(env.PHOTO_MEAL_MODEL_NAME),
    },
    dailyLimit: parseDailyLimit(env.PHOTO_MEAL_DAILY_LIMIT),
  };
}

function extractJsonContent(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid model response');
  }
  if ('candidates' in value && 'overallConfidence' in value && 'questions' in value) {
    return value;
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Invalid model response');
  }
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== 'string') {
    throw new Error('Invalid model response');
  }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Invalid model response');
  }
  return JSON.parse(content.slice(start, end + 1));
}

export function createHttpJsonMealPhotoAnalysisModelClient(
  config: HttpJsonMealPhotoModelConfig,
  fetchImpl: FetchLike,
): MealPhotoAnalysisModelClient {
  return {
    async analyzeMealPhoto(input) {
      const response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.modelName,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                '你是一个谨慎的餐食营养估算助手。',
                '只返回 JSON 对象，字段为 candidates、overallConfidence、questions。',
                '估算必须保守，并提醒用户结果需要人工确认；不要输出医疗建议。',
              ].join(''),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请根据这张餐食照片估算食物名称、重量、烹饪方式、热量、蛋白质、脂肪和碳水。每个候选 confidence 取 0 到 1。',
                },
                {
                  type: 'image_url',
                  image_url: { url: input.photo.dataUrl },
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Model provider request failed: ${response.status ?? 'unknown'}`);
      }
      return extractJsonContent(await response.json());
    },
  };
}

function hashedPathSegment(value: string): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('base64url')
    .slice(0, 32);
}

function photoExtension(mimeType: PreparedMealPhoto['mimeType']): 'jpg' | 'webp' {
  return mimeType === 'image/jpeg' ? 'jpg' : 'webp';
}

function decodePhotoDataUrl(photo: PreparedMealPhoto): Buffer {
  const expectedPrefix = `data:${photo.mimeType};base64,`;
  if (!photo.dataUrl.startsWith(expectedPrefix)) {
    throw new Error('Invalid meal photo data URL');
  }
  return Buffer.from(photo.dataUrl.slice(expectedPrefix.length), 'base64');
}

export function createObjectStorageMealPhotoStorage(
  storage: ObjectStorageUploadFileClient,
): MealPhotoAnalysisStorage {
  return {
    async saveMealPhoto(input) {
      const objectKey = [
        'users',
        hashedPathSegment(input.userId),
        'photo-meal',
        hashedPathSegment(input.requestId),
        `photo.${photoExtension(input.photo.mimeType)}`,
      ].join('/');
      await storage.uploadFile({
        cloudPath: objectKey,
        fileContent: decodePhotoDataUrl(input.photo),
        contentType: input.photo.mimeType,
      });
      return objectKey;
    },
  };
}

function assertNoRpcError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new Error('Photo meal RPC failed');
  }
}

function parseCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Invalid photo meal count response');
  }
  return parsed;
}

export function createRpcMealPhotoAnalysisDatabaseGateway(
  rdb: PhotoMealAnalysisRdbClient,
): MealPhotoAnalysisDatabaseGateway {
  return {
    async countCreatedToday(input) {
      const response = await rdb.rpc('count_my_photo_meal_analyses_by_date', {
        analysis_date: input.date,
      });
      assertNoRpcError(response);
      return parseCount(response.data);
    },
    async create(input) {
      const response = await rdb.rpc('create_my_photo_meal_analysis', {
        payload: input.payload,
      });
      assertNoRpcError(response);
      return photoMealAnalysisSchema.parse(response.data) as PhotoMealAnalysis;
    },
    async get(input) {
      const response = await rdb.rpc('get_my_photo_meal_analysis', {
        analysis_id: input.analysisId,
      });
      assertNoRpcError(response);
      return photoMealAnalysisSchema.parse(response.data) as PhotoMealAnalysis;
    },
    async confirm(input) {
      const response = await rdb.rpc('confirm_my_photo_meal_analysis', {
        analysis_id: input.payload.analysisId,
        meal_date: input.payload.mealDate,
        items: input.payload.items,
      });
      assertNoRpcError(response);
      return confirmPhotoMealAnalysisResultSchema.parse(response.data) as ConfirmPhotoMealAnalysisResult;
    },
    async discard(input) {
      const response = await rdb.rpc('discard_my_photo_meal_analysis', {
        analysis_id: input.analysisId,
      });
      assertNoRpcError(response);
      return photoMealAnalysisSchema.parse(response.data) as PhotoMealAnalysis;
    },
  };
}

function normalizeCloudFunctionEvent(event: MealPhotoAnalysisCloudFunctionEvent): MealPhotoAnalysisHandlerEvent {
  const action = event.action ?? event.data?.action;
  if (action == null) {
    return {
      action: 'get',
      auth: { uid: event.auth?.uid ?? event.context?.uid ?? event.context?.userId },
      payload: undefined,
    };
  }
  return {
    action,
    auth: { uid: event.auth?.uid ?? event.context?.uid ?? event.context?.userId },
    payload: event.payload ?? event.data?.payload,
  };
}

export function createMealPhotoAnalysisCloudFunction(
  deps: MealPhotoAnalysisCloudFunctionDependencies,
): (event: MealPhotoAnalysisCloudFunctionEvent) => Promise<unknown> {
  const config = loadMealPhotoRuntimeConfig(deps.env);
  const handler = createMealPhotoAnalysisHandler({
    storage: createObjectStorageMealPhotoStorage(deps.storage),
    modelClient: createHttpJsonMealPhotoAnalysisModelClient(config.model, deps.fetch),
    database: createRpcMealPhotoAnalysisDatabaseGateway(deps.rdb),
    clock: deps.clock ?? (() => new Date()),
    logger: deps.logger ?? safeLogger,
    dailyLimit: config.dailyLimit,
  });
  return async (event) => handler(normalizeCloudFunctionEvent(event));
}
