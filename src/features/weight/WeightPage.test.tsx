import type { CreateWeightEntryInput, UpdateWeightEntryInput, WeightEntry } from '@daily-record/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { WeightRepository } from '../../platform/weight';
import { WeightPage } from './WeightPage';

const today = '2026-07-28';

function entry(id: string, entryDate: string, weightKg: number, note = ''): WeightEntry {
  return {
    id,
    entryDate,
    weightKg,
    note,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

function createMemoryWeightRepository(initialEntries: WeightEntry[] = []): WeightRepository {
  const entries = [...initialEntries];
  let nextId = 1;

  return {
    async listByDateRange(startDate: string, endDate: string): Promise<WeightEntry[]> {
      return entries
        .filter((item) => item.entryDate >= startDate && item.entryDate <= endDate)
        .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    },
    async create(input: CreateWeightEntryInput): Promise<WeightEntry> {
      const created = entry(`weight-${nextId++}`, input.entryDate, input.weightKg, input.note ?? '');
      entries.push(created);
      return created;
    },
    async update(input: UpdateWeightEntryInput): Promise<WeightEntry> {
      const index = entries.findIndex((item) => item.id === input.id);
      if (index < 0) throw new Error('missing');
      const updated = entry(input.id, input.entryDate, input.weightKg, input.note ?? '');
      entries[index] = updated;
      return updated;
    },
    async delete(id: string): Promise<void> {
      const index = entries.findIndex((item) => item.id === id);
      if (index < 0) throw new Error('missing');
      entries.splice(index, 1);
    },
  };
}

function slowGainEntries(): WeightEntry[] {
  return [
    entry('w1', '2026-07-01', 70),
    entry('w2', '2026-07-02', 70.1),
    entry('w3', '2026-07-03', 70.1),
    entry('w4', '2026-07-04', 70.2),
    entry('w5', '2026-07-05', 70.2),
    entry('w6', '2026-07-06', 70.3),
    entry('w7', '2026-07-07', 70.3),
    entry('w8', '2026-07-22', 70.2),
    entry('w9', '2026-07-23', 70.2),
    entry('w10', '2026-07-24', 70.3),
    entry('w11', '2026-07-25', 70.3),
    entry('w12', '2026-07-26', 70.4),
    entry('w13', '2026-07-27', 70.4),
    entry('w14', '2026-07-28', 70.5),
  ];
}

afterEach(cleanup);

describe('WeightPage', () => {
  it('adds a weight entry and shows it in the recent list', async () => {
    const user = userEvent.setup();
    render(<WeightPage weight={createMemoryWeightRepository()} initialDate={today} />);

    await user.clear(screen.getByLabelText('体重（千克）'));
    await user.type(screen.getByLabelText('体重（千克）'), '70.4');
    await user.type(screen.getByLabelText('备注'), '晨重');
    await user.click(screen.getByRole('button', { name: '保存体重' }));

    expect(await screen.findByRole('heading', { name: '70.4 kg' })).toBeInTheDocument();
    expect(screen.getByText('晨重')).toBeInTheDocument();
    expect(screen.getByText('数据还不够，先继续记录。')).toBeInTheDocument();
  });

  it('deletes a weight entry', async () => {
    const user = userEvent.setup();
    render(
      <WeightPage
        weight={createMemoryWeightRepository([entry('weight-existing', today, 70.4, '晨重')])}
        initialDate={today}
      />,
    );

    const card = await screen.findByRole('article', { name: '70.4 kg' });
    await user.click(within(card).getByRole('button', { name: '删除70.4 kg' }));

    expect(await screen.findByText('还没有记录体重。')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '70.4 kg' })).not.toBeInTheDocument();
  });

  it('edits an existing weight entry through the update action', async () => {
    const user = userEvent.setup();
    render(
      <WeightPage
        weight={createMemoryWeightRepository([entry('weight-existing', today, 70.4, '晨重')])}
        initialDate={today}
      />,
    );

    const card = await screen.findByRole('article', { name: '70.4 kg' });
    await user.click(within(card).getByRole('button', { name: '编辑70.4 kg' }));
    await user.clear(screen.getByLabelText('体重（千克）'));
    await user.type(screen.getByLabelText('体重（千克）'), '70.6');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '训练后');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('heading', { name: '70.6 kg' })).toBeInTheDocument();
    expect(screen.getByText('训练后')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '70.4 kg' })).not.toBeInTheDocument();
  });

  it('keeps the previous rendered list when a mutation fails', async () => {
    const user = userEvent.setup();
    const failingRepository: WeightRepository = {
      listByDateRange: async () => [entry('weight-stable', today, 70.4, '晨重')],
      create: async () => {
        throw new Error('private provider detail');
      },
      update: async () => {
        throw new Error('private provider detail');
      },
      delete: async () => {
        throw new Error('private provider detail');
      },
    };
    render(<WeightPage weight={failingRepository} initialDate={today} />);

    const card = await screen.findByRole('article', { name: '70.4 kg' });
    await user.click(within(card).getByRole('button', { name: '删除70.4 kg' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('删除失败，当前列表已保留。');
    expect(screen.getByRole('heading', { name: '70.4 kg' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private provider detail');
  });

  it('shows a calorie increase suggestion after slow 21-day gain', async () => {
    render(<WeightPage weight={createMemoryWeightRepository(slowGainEntries())} initialDate={today} />);

    expect(await screen.findByText('建议每日增加 100 kcal')).toBeInTheDocument();
    expect(screen.getByText('此建议只是估算，不会自动修改你的营养目标。')).toBeInTheDocument();
    expect(screen.getByText(/7 日均重/)).toBeInTheDocument();
  });
});
