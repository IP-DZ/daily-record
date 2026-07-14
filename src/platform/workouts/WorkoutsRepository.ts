import type {
  CreateWorkoutInput,
  UpdateWorkoutInput,
  WorkoutSession,
} from '@daily-record/contracts';

export interface WorkoutsRepository {
  listByDateRange(startDate: string, endDate: string): Promise<WorkoutSession[]>;
  create(input: CreateWorkoutInput): Promise<WorkoutSession>;
  update(input: UpdateWorkoutInput): Promise<WorkoutSession>;
  delete(id: string): Promise<void>;
  copyLatest(targetDate: string): Promise<WorkoutSession>;
}

export class WorkoutsRepositoryError extends Error {
  readonly code = 'workouts/unavailable';

  constructor() {
    super('Workouts are unavailable');
    this.name = 'WorkoutsRepositoryError';
  }
}
