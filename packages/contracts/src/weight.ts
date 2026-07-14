import { z } from 'zod';

export interface WeightEntry {
  id: string;
  entryDate: string;
  weightKg: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWeightEntryInput {
  entryDate: string;
  weightKg: number;
  note?: string;
}

export interface UpdateWeightEntryInput {
  id: string;
  entryDate: string;
  weightKg: number;
  note?: string;
}

const entryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weightKgSchema = z.number().finite().min(30).max(350);
const weightNoteSchema = z.string().max(500);

const createWeightEntryInputObjectSchema = z
  .object({
    entryDate: entryDateSchema,
    weightKg: weightKgSchema,
    note: weightNoteSchema.optional(),
  })
  .strict();

export const createWeightEntryInputSchema: z.ZodType<CreateWeightEntryInput> =
  createWeightEntryInputObjectSchema;

export const updateWeightEntryInputSchema: z.ZodType<UpdateWeightEntryInput> =
  createWeightEntryInputObjectSchema.extend({
    id: z.string().min(1),
  }).strict();

export const weightEntrySchema: z.ZodType<WeightEntry> = createWeightEntryInputObjectSchema
  .extend({
    id: z.string().min(1),
    note: weightNoteSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
