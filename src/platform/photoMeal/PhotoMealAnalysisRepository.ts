import type {
  ConfirmPhotoMealAnalysisInput,
  CreatePhotoMealAnalysisInput,
  MealEntry,
  PhotoMealAnalysis,
} from '@daily-record/contracts';

export interface PhotoMealAnalysisRepository {
  create(input: CreatePhotoMealAnalysisInput): Promise<PhotoMealAnalysis>;
  get(id: string): Promise<PhotoMealAnalysis>;
  confirm(input: ConfirmPhotoMealAnalysisInput): Promise<MealEntry[]>;
  discard(id: string): Promise<void>;
}

export class PhotoMealAnalysisRepositoryError extends Error {
  readonly code = 'photo-meal/unavailable';

  constructor() {
    super('Photo meal analysis is unavailable');
    this.name = 'PhotoMealAnalysisRepositoryError';
  }
}
