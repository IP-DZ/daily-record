import {
  createWeightEntryInputSchema,
  updateWeightEntryInputSchema,
  weightEntrySchema,
  type CreateWeightEntryInput,
  type UpdateWeightEntryInput,
  type WeightEntry,
} from '@daily-record/contracts';

import type { WeightRepository } from '../weight';
import { WeightRepositoryError } from '../weight';

type WeightRpcName =
  | 'list_my_weight_entries'
  | 'create_my_weight_entry'
  | 'update_my_weight_entry'
  | 'delete_my_weight_entry';

export interface CloudBaseWeightRdbClient {
  rpc(
    name: WeightRpcName,
    parameters?:
      | { start_date: string; end_date: string }
      | { payload: CreateWeightEntryInput | UpdateWeightEntryInput }
      | { entry_id: string },
  ): Promise<{ data: unknown; error?: unknown }>;
}

function requireDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WeightRepositoryError();
  }
  return date;
}

function requireId(id: string): string {
  if (id.trim().length === 0) {
    throw new WeightRepositoryError();
  }
  return id;
}

function assertNoProviderError(response: { error?: unknown }): void {
  if (response.error != null) {
    throw new WeightRepositoryError();
  }
}

function parseWeightEntries(value: unknown): WeightEntry[] {
  if (!Array.isArray(value)) {
    throw new WeightRepositoryError();
  }
  return value.map((entry) => weightEntrySchema.parse(entry));
}

export class CloudBaseWeightRepository implements WeightRepository {
  constructor(private readonly rdb: CloudBaseWeightRdbClient) {}

  async listByDateRange(startDate: string, endDate: string): Promise<WeightEntry[]> {
    try {
      const response = await this.rdb.rpc('list_my_weight_entries', {
        start_date: requireDate(startDate),
        end_date: requireDate(endDate),
      });
      assertNoProviderError(response);
      return parseWeightEntries(response.data);
    } catch {
      throw new WeightRepositoryError();
    }
  }

  async create(input: CreateWeightEntryInput): Promise<WeightEntry> {
    try {
      const payload = createWeightEntryInputSchema.parse(input);
      const response = await this.rdb.rpc('create_my_weight_entry', { payload });
      assertNoProviderError(response);
      return weightEntrySchema.parse(response.data);
    } catch {
      throw new WeightRepositoryError();
    }
  }

  async update(input: UpdateWeightEntryInput): Promise<WeightEntry> {
    try {
      const payload = updateWeightEntryInputSchema.parse(input);
      const response = await this.rdb.rpc('update_my_weight_entry', { payload });
      assertNoProviderError(response);
      return weightEntrySchema.parse(response.data);
    } catch {
      throw new WeightRepositoryError();
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const response = await this.rdb.rpc('delete_my_weight_entry', {
        entry_id: requireId(id),
      });
      assertNoProviderError(response);
    } catch {
      throw new WeightRepositoryError();
    }
  }
}
