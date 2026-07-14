import { z } from 'zod';

import {
  confirmPhotoMealAnalysisInputSchema,
  createPhotoMealAnalysisInputSchema,
  photoMealAnalysisSchema,
  photoMealCandidateSchema,
  type ConfirmPhotoMealAnalysisInput,
  type ConfirmPhotoMealAnalysisResult,
  type CreatePhotoMealAnalysisInput,
  type PhotoMealAnalysis,
  type PreparedMealPhoto,
} from '@daily-record/contracts';

export type MealPhotoAnalysisAction = 'create' | 'get' | 'confirm' | 'discard';

export interface MealPhotoAnalysisHandlerEvent {
  action: MealPhotoAnalysisAction;
  auth?: {
    uid?: string | null;
  };
  payload?: unknown;
}

export interface MealPhotoAnalysisStorage {
  saveMealPhoto(input: {
    userId: string;
    requestId: string;
    photo: PreparedMealPhoto;
  }): Promise<string>;
}

export interface MealPhotoAnalysisModelClient {
  analyzeMealPhoto(input: {
    imageObjectKey: string;
    photo: PreparedMealPhoto;
  }): Promise<unknown>;
}

export interface MealPhotoAnalysisDatabaseGateway {
  countCreatedToday(input: { userId: string; date: string }): Promise<number>;
  create(input: {
    userId: string;
    payload: {
      mealDate: string;
      requestId: string;
      imageObjectKey: string;
      candidates: unknown[];
      overallConfidence: number;
      questions: string[];
      errorCode: string | null;
    };
  }): Promise<PhotoMealAnalysis>;
  get(input: { userId: string; analysisId: string }): Promise<PhotoMealAnalysis>;
  confirm(input: {
    userId: string;
    payload: ConfirmPhotoMealAnalysisInput;
  }): Promise<ConfirmPhotoMealAnalysisResult>;
  discard(input: { userId: string; analysisId: string }): Promise<PhotoMealAnalysis>;
}

export interface MealPhotoAnalysisLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface MealPhotoAnalysisHandlerDependencies {
  storage: MealPhotoAnalysisStorage;
  modelClient: MealPhotoAnalysisModelClient;
  database: MealPhotoAnalysisDatabaseGateway;
  clock: () => Date;
  logger: MealPhotoAnalysisLogger;
  dailyLimit?: number;
}

export class MealPhotoAnalysisHandlerError extends Error {
  constructor(
    public readonly code: 'unauthenticated' | 'bad_request' | 'daily_limit_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'MealPhotoAnalysisHandlerError';
  }
}

const modelAnalysisSchema = z
  .object({
    candidates: z.array(photoMealCandidateSchema).max(12),
    overallConfidence: z.number().finite().min(0).max(1),
    questions: z.array(z.string().min(1).max(120)).max(5),
  })
  .strict();

function requireUserId(event: MealPhotoAnalysisHandlerEvent): string {
  const userId = event.auth?.uid;
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new MealPhotoAnalysisHandlerError('unauthenticated', 'Authenticated user is required');
  }
  return userId;
}

function parseAnalysisId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new MealPhotoAnalysisHandlerError('bad_request', 'Invalid photo meal request');
  }
  const analysisId = (payload as { analysisId?: unknown }).analysisId;
  if (typeof analysisId !== 'string' || analysisId.trim() === '') {
    throw new MealPhotoAnalysisHandlerError('bad_request', 'Invalid photo meal request');
  }
  return analysisId;
}

function stripConfirmPayload(payload: unknown): ConfirmPhotoMealAnalysisInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new MealPhotoAnalysisHandlerError('bad_request', 'Invalid photo meal request');
  }
  const { analysisId, mealDate, items } = payload as Record<string, unknown>;
  return confirmPhotoMealAnalysisInputSchema.parse({ analysisId, mealDate, items });
}

async function analyzeWithOneRetry(
  deps: MealPhotoAnalysisHandlerDependencies,
  input: {
    imageObjectKey: string;
    photo: PreparedMealPhoto;
  },
): Promise<{
  candidates: unknown[];
  overallConfidence: number;
  questions: string[];
  errorCode: string | null;
}> {
  for (const attempt of [1, 2]) {
    try {
      const parsed = modelAnalysisSchema.parse(await deps.modelClient.analyzeMealPhoto(input));
      return {
        candidates: parsed.candidates,
        overallConfidence: parsed.overallConfidence,
        questions: parsed.questions,
        errorCode: null,
      };
    } catch {
      if (attempt === 1) {
        deps.logger.warn('photo_meal.model_retry', { outcome: 'invalid_model_response' });
        continue;
      }
      deps.logger.warn('photo_meal.analysis_failed', { errorCode: 'model_failed' });
    }
  }
  return {
    candidates: [],
    overallConfidence: 0,
    questions: [],
    errorCode: 'model_failed',
  };
}

export function createMealPhotoAnalysisHandler(deps: MealPhotoAnalysisHandlerDependencies) {
  const dailyLimit = deps.dailyLimit ?? 20;

  return async function mealPhotoAnalysisHandler(event: MealPhotoAnalysisHandlerEvent): Promise<unknown> {
    const userId = requireUserId(event);

    if (event.action === 'create') {
      const input = createPhotoMealAnalysisInputSchema.parse(event.payload) as CreatePhotoMealAnalysisInput;
      const usageDate = deps.clock().toISOString().slice(0, 10);
      const createdToday = await deps.database.countCreatedToday({ userId, date: usageDate });
      if (createdToday >= dailyLimit) {
        throw new MealPhotoAnalysisHandlerError('daily_limit_exceeded', 'Daily photo meal limit exceeded');
      }

      const imageObjectKey = await deps.storage.saveMealPhoto({
        userId,
        requestId: input.requestId,
        photo: input.photo,
      });
      const modelEstimate = await analyzeWithOneRetry(deps, {
        imageObjectKey,
        photo: input.photo,
      });
      const analysis = await deps.database.create({
        userId,
        payload: {
          mealDate: input.mealDate,
          requestId: input.requestId,
          imageObjectKey,
          candidates: modelEstimate.candidates,
          overallConfidence: modelEstimate.overallConfidence,
          questions: modelEstimate.questions,
          errorCode: modelEstimate.errorCode,
        },
      });
      deps.logger.info('photo_meal.analysis_created', {
        requestId: input.requestId,
        entityType: 'photoMealAnalysis',
        entityId: analysis.id,
        outcome: analysis.status,
      });
      return photoMealAnalysisSchema.parse(analysis);
    }

    if (event.action === 'get') {
      return deps.database.get({ userId, analysisId: parseAnalysisId(event.payload) });
    }

    if (event.action === 'confirm') {
      const payload = stripConfirmPayload(event.payload);
      return deps.database.confirm({ userId, payload });
    }

    if (event.action === 'discard') {
      return deps.database.discard({ userId, analysisId: parseAnalysisId(event.payload) });
    }

    throw new MealPhotoAnalysisHandlerError('bad_request', 'Invalid photo meal action');
  };
}
