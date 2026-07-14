import { z } from 'zod';

import {
  mealEntrySchema,
  mealNutritionTotalsSchema,
  type CreateMealInput,
  type MealEntry,
  type MealNutritionTotals,
} from './meals';

export type PhotoMealAnalysisStatus =
  | 'processing'
  | 'needs-confirmation'
  | 'failed'
  | 'confirmed'
  | 'discarded';

export interface PhotoMealCandidate {
  id: string;
  name: string;
  estimatedGrams: number;
  cookingMethod: string;
  nutrition: MealNutritionTotals;
  confidence: number;
  questions: string[];
}

export interface PhotoMealAnalysis {
  id: string;
  mealDate: string;
  requestId: string;
  status: PhotoMealAnalysisStatus;
  candidates: PhotoMealCandidate[];
  overallConfidence: number;
  questions: string[];
  imageObjectKey: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedMealPhoto {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
  originalName: string;
}

export interface CreatePhotoMealAnalysisInput {
  mealDate: string;
  requestId: string;
  photo: PreparedMealPhoto;
}

export interface ConfirmPhotoMealAnalysisInput {
  analysisId: string;
  mealDate: string;
  items: PhotoMealCandidate[];
}

export interface ConfirmPhotoMealAnalysisResult {
  analysis: PhotoMealAnalysis;
  meals: MealEntry[];
}

export type PhotoMealCandidateMealInput = CreateMealInput;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shortIdSchema = z.string().min(1).max(120);
const candidateTextSchema = z.string().min(1).max(80);
const cookingMethodSchema = z.string().max(80);
const questionSchema = z.string().min(1).max(120);

function isPrivateObjectKey(value: string): boolean {
  return value.startsWith('users/')
    && !value.includes('://')
    && !value.includes('?')
    && !value.includes('#');
}

export const photoMealCandidateSchema: z.ZodType<PhotoMealCandidate> = z
  .object({
    id: shortIdSchema,
    name: candidateTextSchema,
    estimatedGrams: z.number().finite().min(0).max(5000),
    cookingMethod: cookingMethodSchema,
    nutrition: mealNutritionTotalsSchema,
    confidence: z.number().finite().min(0).max(1),
    questions: z.array(questionSchema).max(5),
  })
  .strict();

export const preparedMealPhotoSchema: z.ZodType<PreparedMealPhoto> = z
  .object({
    dataUrl: z.string().regex(/^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    mimeType: z.enum(['image/jpeg', 'image/webp']),
    sizeBytes: z.number().int().min(1).max(1_500_000),
    width: z.number().int().min(1).max(10_000),
    height: z.number().int().min(1).max(10_000),
    originalName: z.string().min(1).max(120),
  })
  .strict()
  .superRefine((photo, context) => {
    if (!photo.dataUrl.startsWith(`data:${photo.mimeType};base64,`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dataUrl'],
        message: 'dataUrl mime type must match mimeType',
      });
    }
  });

export const photoMealAnalysisSchema: z.ZodType<PhotoMealAnalysis> = z
  .object({
    id: shortIdSchema,
    mealDate: isoDateSchema,
    requestId: shortIdSchema,
    status: z.enum(['processing', 'needs-confirmation', 'failed', 'confirmed', 'discarded']),
    candidates: z.array(photoMealCandidateSchema).max(12),
    overallConfidence: z.number().finite().min(0).max(1),
    questions: z.array(questionSchema).max(5),
    imageObjectKey: z.string().min(1).max(500).refine(isPrivateObjectKey),
    errorCode: z.string().min(1).max(80).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const createPhotoMealAnalysisInputSchema: z.ZodType<CreatePhotoMealAnalysisInput> = z
  .object({
    mealDate: isoDateSchema,
    requestId: shortIdSchema,
    photo: preparedMealPhotoSchema,
  })
  .strict();

export const confirmPhotoMealAnalysisInputSchema: z.ZodType<ConfirmPhotoMealAnalysisInput> = z
  .object({
    analysisId: shortIdSchema,
    mealDate: isoDateSchema,
    items: z.array(photoMealCandidateSchema).min(1).max(12),
  })
  .strict();

export const confirmPhotoMealAnalysisResultSchema: z.ZodType<ConfirmPhotoMealAnalysisResult> = z
  .object({
    analysis: photoMealAnalysisSchema,
    meals: z.array(mealEntrySchema),
  })
  .strict();
