import { describe, expect, it, vi } from 'vitest';

import type { CreateWeightEntryInput, WeightEntry } from '@daily-record/contracts';
import { WeightRepositoryError } from '../weight';
import { CloudBaseWeightRepository } from './CloudBaseWeightRepository';

const createInput: CreateWeightEntryInput = {
  entryDate: '2026-07-14',
  weightKg: 70.4,
  note: '晨重',
};
const entry: WeightEntry = {
  id: 'weight-1',
  ...createInput,
  note: createInput.note ?? '',
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

describe('CloudBaseWeightRepository', () => {
  it('calls owned weight RPCs with validated command payloads and parses responses', async () => {
    const updated = { ...entry, weightKg: 70.6 };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [entry], error: null })
      .mockResolvedValueOnce({ data: entry, error: null })
      .mockResolvedValueOnce({ data: updated, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const repository = new CloudBaseWeightRepository({ rpc });

    await expect(repository.listByDateRange('2026-07-01', '2026-07-31')).resolves.toEqual([entry]);
    await expect(repository.create(createInput)).resolves.toEqual(entry);
    await expect(repository.update({ id: entry.id, ...createInput, weightKg: 70.6 }))
      .resolves.toEqual(updated);
    await expect(repository.delete(entry.id)).resolves.toBeUndefined();

    expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_weight_entries', {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_my_weight_entry', { payload: createInput });
    expect(rpc).toHaveBeenNthCalledWith(3, 'update_my_weight_entry', {
      payload: { id: entry.id, ...createInput, weightKg: 70.6 },
    });
    expect(rpc).toHaveBeenNthCalledWith(4, 'delete_my_weight_entry', { entry_id: entry.id });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/userId|user_id|email/i);
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private database detail' } }],
    ['invalid returned entry', { data: { ...entry, weightKg: -1 }, error: null }],
  ])('maps %s to a stable safe weight error', async (_case, response) => {
    const repository = new CloudBaseWeightRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.create(createInput).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(WeightRepositoryError);
    expect(error).toMatchObject({
      code: 'weight/unavailable',
      message: 'Weight entries are unavailable',
    });
    expect(String(error)).not.toContain('private database detail');
  });
});
