import { describe, expect, it, vi } from 'vitest';

import type { CreateWorkoutInput, WorkoutSession } from '@daily-record/contracts';
import { WorkoutsRepositoryError } from '../workouts';
import { CloudBaseWorkoutsRepository } from './CloudBaseWorkoutsRepository';

const createInput: CreateWorkoutInput = {
  workoutDate: '2026-07-14',
  bodyParts: ['胸'],
  durationMinutes: 60,
  note: '',
  exercises: [{
    id: 'exercise-form-1',
    name: '卧推',
    order: 1,
    sets: [
      { id: 'set-form-1', order: 1, weightKg: 60, reps: 8, completed: true },
    ],
  }],
};
const workout: WorkoutSession = {
  id: 'workout-1',
  ...createInput,
  note: '',
  volumeKg: 480,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

describe('CloudBaseWorkoutsRepository', () => {
  it('calls owned workout RPCs with validated command payloads and parses responses', async () => {
    const copied = { ...workout, id: 'workout-copy', workoutDate: '2026-07-15' };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [workout], error: null })
      .mockResolvedValueOnce({ data: workout, error: null })
      .mockResolvedValueOnce({ data: { ...workout, durationMinutes: 65 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: copied, error: null });
    const repository = new CloudBaseWorkoutsRepository({ rpc });

    await expect(repository.listByDateRange('2026-07-01', '2026-07-31')).resolves.toEqual([workout]);
    await expect(repository.create(createInput)).resolves.toEqual(workout);
    await expect(repository.update({ id: workout.id, ...createInput, durationMinutes: 65 }))
      .resolves.toMatchObject({ id: workout.id, durationMinutes: 65 });
    await expect(repository.delete(workout.id)).resolves.toBeUndefined();
    await expect(repository.copyLatest('2026-07-15')).resolves.toEqual(copied);

    expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_workouts', {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_my_workout', { payload: createInput });
    expect(rpc).toHaveBeenNthCalledWith(3, 'update_my_workout', {
      payload: { id: workout.id, ...createInput, durationMinutes: 65 },
    });
    expect(rpc).toHaveBeenNthCalledWith(4, 'delete_my_workout', { workout_id: workout.id });
    expect(rpc).toHaveBeenNthCalledWith(5, 'copy_my_latest_workout', {
      target_workout_date: '2026-07-15',
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/userId|user_id|email/i);
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private database detail' } }],
    ['invalid returned workout', { data: { ...workout, bodyParts: [] }, error: null }],
  ])('maps %s to a stable safe workouts error', async (_case, response) => {
    const repository = new CloudBaseWorkoutsRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.create(createInput).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WorkoutsRepositoryError);
    expect(error).toMatchObject({
      code: 'workouts/unavailable',
      message: 'Workouts are unavailable',
    });
    expect(String(error)).not.toContain('private database detail');
  });
});
