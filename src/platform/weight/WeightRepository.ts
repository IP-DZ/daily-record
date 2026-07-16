import type {
  CreateWeightEntryInput,
  UpdateWeightEntryInput,
  WeightEntry,
} from '@daily-record/contracts';

export interface WeightRepository {
  listByDateRange(startDate: string, endDate: string): Promise<WeightEntry[]>;
  create(input: CreateWeightEntryInput): Promise<WeightEntry>;
  update(input: UpdateWeightEntryInput): Promise<WeightEntry>;
  delete(id: string): Promise<void>;
}

export class WeightRepositoryError extends Error {
  readonly code = 'weight/unavailable';

  constructor() {
    super('Weight entries are unavailable');
    this.name = 'WeightRepositoryError';
  }
}
