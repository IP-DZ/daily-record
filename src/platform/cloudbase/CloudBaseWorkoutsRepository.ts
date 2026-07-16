import {
  createWorkoutInputSchema,
  updateWorkoutInputSchema,
  workoutSessionSchema,
  type CreateWorkoutInput,
  type UpdateWorkoutInput,
  type WorkoutSession,
} from '@daily-record/contracts';

import type { WorkoutsRepository } from '../workouts';
import { WorkoutsRepositoryError } from '../workouts';

type WorkoutRpcName =
  | 'list_my_workouts'
  | 'create_my_workout'
  | 'update_my_workout'
  | 'delete_my_workout'
  | 'copy_my_latest_workout';

export interface CloudBaseWorkoutsRdbClient {
  rpc(
    name: WorkoutRpcName,
    parameters?:
      | { start_date: string; end_date: string }
      | { payload: CreateWorkoutInput | UpdateWorkoutInput }
      | { workout_id: string }
      | { target_workout_date: string },
  ): Promise<{ data: unknown; error?: unknown }>;
}

function requireDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WorkoutsRepositoryError();
  }
  return date;
}

function requireId(id: string): string {
  if (id.trim().length === 0) {
    throw new WorkoutsRepositoryError();
  }
  return id;
}

function assertNoProviderError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new WorkoutsRepositoryError();
  }
}

function parseWorkouts(value: unknown): WorkoutSession[] {
  if (!Array.isArray(value)) {
    throw new WorkoutsRepositoryError();
  }
  return value.map((workout) => workoutSessionSchema.parse(workout));
}

export class CloudBaseWorkoutsRepository implements WorkoutsRepository {
  constructor(private readonly rdb: CloudBaseWorkoutsRdbClient) {}

  async listByDateRange(startDate: string, endDate: string): Promise<WorkoutSession[]> {
    try {
      const response = await this.rdb.rpc('list_my_workouts', {
        start_date: requireDate(startDate),
        end_date: requireDate(endDate),
      });
      assertNoProviderError(response);
      return parseWorkouts(response.data);
    } catch {
      throw new WorkoutsRepositoryError();
    }
  }

  async create(input: CreateWorkoutInput): Promise<WorkoutSession> {
    try {
      const payload = createWorkoutInputSchema.parse(input);
      const response = await this.rdb.rpc('create_my_workout', { payload });
      assertNoProviderError(response);
      return workoutSessionSchema.parse(response.data);
    } catch {
      throw new WorkoutsRepositoryError();
    }
  }

  async update(input: UpdateWorkoutInput): Promise<WorkoutSession> {
    try {
      const payload = updateWorkoutInputSchema.parse(input);
      const response = await this.rdb.rpc('update_my_workout', { payload });
      assertNoProviderError(response);
      return workoutSessionSchema.parse(response.data);
    } catch {
      throw new WorkoutsRepositoryError();
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const response = await this.rdb.rpc('delete_my_workout', {
        workout_id: requireId(id),
      });
      assertNoProviderError(response);
    } catch {
      throw new WorkoutsRepositoryError();
    }
  }

  async copyLatest(targetDate: string): Promise<WorkoutSession> {
    try {
      const response = await this.rdb.rpc('copy_my_latest_workout', {
        target_workout_date: requireDate(targetDate),
      });
      assertNoProviderError(response);
      return workoutSessionSchema.parse(response.data);
    } catch {
      throw new WorkoutsRepositoryError();
    }
  }
}
