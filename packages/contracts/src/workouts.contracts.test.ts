import { describe, expect, it } from 'vitest';

import {
  createWorkoutInputSchema,
  updateWorkoutInputSchema,
  workoutSessionSchema,
} from './index';
import type {
  CreateWorkoutInput,
  UpdateWorkoutInput,
  WorkoutSession,
} from './index';

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

const createWorkoutInputKeepsExercises: IsExact<
  CreateWorkoutInput['exercises'],
  WorkoutSession['exercises']
> = true;
const updateWorkoutInputKeepsId: IsExact<UpdateWorkoutInput['id'], WorkoutSession['id']> = true;

describe('workout contracts', () => {
  const validCreateWorkoutInput = {
    workoutDate: '2026-07-14',
    bodyParts: ['胸', '肩'],
    durationMinutes: 60,
    note: '状态不错',
    exercises: [
      {
        id: 'exercise-form-1',
        name: '卧推',
        order: 1,
        sets: [
          { id: 'set-form-1', order: 1, weightKg: 60, reps: 8, completed: true },
          { id: 'set-form-2', order: 2, weightKg: 60, reps: 8, completed: false },
        ],
      },
    ],
  } as const;

  it('accepts workout sessions with ordered exercises and sets', () => {
    expect(createWorkoutInputSchema.parse(validCreateWorkoutInput)).toEqual(validCreateWorkoutInput);
    expect(updateWorkoutInputSchema.parse({ id: 'workout-1', ...validCreateWorkoutInput })).toEqual({
      id: 'workout-1',
      ...validCreateWorkoutInput,
    });
    expect(
      workoutSessionSchema.parse({
        id: 'workout-1',
        ...validCreateWorkoutInput,
        volumeKg: 480,
        createdAt: '2026-07-14T12:00:00.000Z',
        updatedAt: '2026-07-14T12:00:00.000Z',
      }),
    ).toBeDefined();
    expect([createWorkoutInputKeepsExercises, updateWorkoutInputKeepsId]).toEqual([true, true]);
  });

  it.each([
    ['invalid workout date', { ...validCreateWorkoutInput, workoutDate: '2026-7-14' }],
    ['empty body parts', { ...validCreateWorkoutInput, bodyParts: [] }],
    ['empty body part', { ...validCreateWorkoutInput, bodyParts: [''] }],
    ['negative duration', { ...validCreateWorkoutInput, durationMinutes: -1 }],
    ['duration above maximum', { ...validCreateWorkoutInput, durationMinutes: 601 }],
    [
      'empty exercise name',
      { ...validCreateWorkoutInput, exercises: [{ ...validCreateWorkoutInput.exercises[0], name: '' }] },
    ],
    [
      'negative set weight',
      {
        ...validCreateWorkoutInput,
        exercises: [{
          ...validCreateWorkoutInput.exercises[0],
          sets: [{ ...validCreateWorkoutInput.exercises[0].sets[0], weightKg: -1 }],
        }],
      },
    ],
    [
      'negative reps',
      {
        ...validCreateWorkoutInput,
        exercises: [{
          ...validCreateWorkoutInput.exercises[0],
          sets: [{ ...validCreateWorkoutInput.exercises[0].sets[0], reps: -1 }],
        }],
      },
    ],
    ['unknown extra keys', { ...validCreateWorkoutInput, source: 'template' }],
  ])('rejects %s', (_label, value) => {
    expect(() => createWorkoutInputSchema.parse(value)).toThrow();
  });
});
