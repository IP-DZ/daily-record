import {
  confirmPhotoMealAnalysisInputSchema,
  confirmPhotoMealAnalysisResultSchema,
  createPhotoMealAnalysisInputSchema,
  photoMealAnalysisSchema,
  type ConfirmPhotoMealAnalysisInput,
  type CreatePhotoMealAnalysisInput,
  type MealEntry,
  type PhotoMealAnalysis,
} from '@daily-record/contracts';

import type { PhotoMealAnalysisRepository } from '../photoMeal';
import { PhotoMealAnalysisRepositoryError } from '../photoMeal';

type PhotoMealAnalysisAction = 'create' | 'get' | 'confirm' | 'discard';

type PhotoMealAnalysisPayload =
  | CreatePhotoMealAnalysisInput
  | ConfirmPhotoMealAnalysisInput
  | { analysisId: string };

export interface CloudBasePhotoMealFunctionClient {
  callFunction(input: {
    name: 'mealPhotoAnalysis';
    data: {
      action: PhotoMealAnalysisAction;
      payload: PhotoMealAnalysisPayload;
    };
  }): Promise<{ result?: unknown; error?: unknown }>;
}

function requireAnalysisId(id: string): string {
  if (id.trim().length === 0) {
    throw new PhotoMealAnalysisRepositoryError();
  }
  return id;
}

function assertNoProviderError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new PhotoMealAnalysisRepositoryError();
  }
}

export class CloudBasePhotoMealAnalysisRepository implements PhotoMealAnalysisRepository {
  constructor(private readonly client: CloudBasePhotoMealFunctionClient) {}

  private async call(
    action: PhotoMealAnalysisAction,
    payload: PhotoMealAnalysisPayload,
  ): Promise<unknown> {
    const response = await this.client.callFunction({
      name: 'mealPhotoAnalysis',
      data: { action, payload },
    });
    assertNoProviderError(response);
    return response.result;
  }

  async create(input: CreatePhotoMealAnalysisInput): Promise<PhotoMealAnalysis> {
    try {
      const payload = createPhotoMealAnalysisInputSchema.parse(input);
      return photoMealAnalysisSchema.parse(await this.call('create', payload));
    } catch {
      throw new PhotoMealAnalysisRepositoryError();
    }
  }

  async get(id: string): Promise<PhotoMealAnalysis> {
    try {
      return photoMealAnalysisSchema.parse(await this.call('get', {
        analysisId: requireAnalysisId(id),
      }));
    } catch {
      throw new PhotoMealAnalysisRepositoryError();
    }
  }

  async confirm(input: ConfirmPhotoMealAnalysisInput): Promise<MealEntry[]> {
    try {
      const payload = confirmPhotoMealAnalysisInputSchema.parse(input);
      const result = confirmPhotoMealAnalysisResultSchema.parse(await this.call('confirm', payload));
      return result.meals;
    } catch {
      throw new PhotoMealAnalysisRepositoryError();
    }
  }

  async discard(id: string): Promise<void> {
    try {
      await this.call('discard', { analysisId: requireAnalysisId(id) });
    } catch {
      throw new PhotoMealAnalysisRepositoryError();
    }
  }
}
