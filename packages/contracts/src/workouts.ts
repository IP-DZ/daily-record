import { z } from 'zod';

export interface WorkoutSet {
  id: string;
  order: number;
  weightKg: number;
  reps: number;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  order: number;
  sets: WorkoutSet[];
}

export interface WorkoutSession {
  id: string;
  workoutDate: string;
  bodyParts: string[];
  durationMinutes: number | null;
  note: string;
  exercises: WorkoutExercise[];
  volumeKg: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkoutInput {
  workoutDate: string;
  bodyParts: string[];
  durationMinutes: number | null;
  note?: string;
  exercises: WorkoutExercise[];
}

export interface UpdateWorkoutInput extends CreateWorkoutInput {
  id: string;
}

const workoutDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const workoutTextSchema = z.string().min(1).max(80);
const workoutNoteSchema = z.string().max(500);
const durationMinutesSchema = z.number().int().min(0).max(600).nullable();
const orderSchema = z.number().int().min(1).max(1000);

const workoutSetSchemaObject = z
  .object({
    id: z.string().min(1),
    order: orderSchema,
    weightKg: z.number().finite().min(0).max(1000),
    reps: z.number().int().min(0).max(1000),
    completed: z.boolean(),
  })
  .strict();

export const workoutSetSchema: z.ZodType<WorkoutSet> = workoutSetSchemaObject;

const workoutExerciseSchemaObject = z
  .object({
    id: z.string().min(1),
    name: workoutTextSchema,
    order: orderSchema,
    sets: z.array(workoutSetSchemaObject).min(1),
  })
  .strict();

export const workoutExerciseSchema: z.ZodType<WorkoutExercise> = workoutExerciseSchemaObject;

const createWorkoutInputObjectSchema = z
  .object({
    workoutDate: workoutDateSchema,
    bodyParts: z.array(workoutTextSchema).min(1),
    durationMinutes: durationMinutesSchema,
    note: workoutNoteSchema.optional(),
    exercises: z.array(workoutExerciseSchemaObject).min(1),
  })
  .strict();

export const createWorkoutInputSchema: z.ZodType<CreateWorkoutInput> =
  createWorkoutInputObjectSchema;

export const updateWorkoutInputSchema: z.ZodType<UpdateWorkoutInput> =
  createWorkoutInputObjectSchema.extend({
    id: z.string().min(1),
  }).strict();

export const workoutSessionSchema: z.ZodType<WorkoutSession> =
  createWorkoutInputObjectSchema.extend({
    id: z.string().min(1),
    note: workoutNoteSchema,
    volumeKg: z.number().finite().min(0),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  }).strict();
