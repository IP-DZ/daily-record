import type { CreateMealInput, MealEntry, UpdateMealInput } from '@daily-record/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeMeals } from '../../domain/meals';
import type { MealsByDate, MealsRepository } from '../../platform/meals';
import { TodayPage } from './TodayPage';

const today = '2026-07-14';

function entry(id: string, input: CreateMealInput): MealEntry {
  const timestamp = '2026-07-14T00:00:00.000Z';
  return {
    id,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createMemoryMealsRepository(initialMeals: MealEntry[] = []): MealsRepository {
  const meals = [...initialMeals];
  let nextId = 1;

  return {
    async listByDate(mealDate: string): Promise<MealsByDate> {
      const mealsForDate = meals.filter((meal) => meal.mealDate === mealDate);
      return {
        meals: mealsForDate,
        totals: summarizeMeals(mealsForDate),
      };
    },
    async create(input: CreateMealInput): Promise<MealEntry> {
      const created = entry(`meal-${nextId++}`, input);
      meals.push(created);
      return created;
    },
    async update(input: UpdateMealInput): Promise<MealEntry> {
      const index = meals.findIndex((meal) => meal.id === input.id);
      if (index < 0) throw new Error('meal not found');
      const updated = entry(input.id, input);
      meals[index] = updated;
      return updated;
    },
    async delete(id: string): Promise<void> {
      const index = meals.findIndex((meal) => meal.id === id);
      if (index < 0) throw new Error('meal not found');
      meals.splice(index, 1);
    },
    async copy(id: string, mealDate: string): Promise<MealEntry> {
      const source = meals.find((meal) => meal.id === id);
      if (source === undefined) throw new Error('meal not found');
      const copied = entry(`meal-${nextId++}`, {
        mealDate,
        name: source.name,
        amount: source.amount,
        nutrition: source.nutrition,
      });
      meals.push(copied);
      return copied;
    },
  };
}

async function fillMealForm(user: ReturnType<typeof userEvent.setup>, values: {
  name: string;
  amount: string;
  caloriesKcal: string;
  proteinGrams: string;
  fatGrams: string;
  carbsGrams: string;
}) {
  await user.clear(screen.getByLabelText('餐食名称'));
  await user.type(screen.getByLabelText('餐食名称'), values.name);
  await user.clear(screen.getByLabelText('份量'));
  await user.type(screen.getByLabelText('份量'), values.amount);
  await user.clear(screen.getByLabelText('热量'));
  await user.type(screen.getByLabelText('热量'), values.caloriesKcal);
  await user.clear(screen.getByLabelText('蛋白质'));
  await user.type(screen.getByLabelText('蛋白质'), values.proteinGrams);
  await user.clear(screen.getByLabelText('脂肪'));
  await user.type(screen.getByLabelText('脂肪'), values.fatGrams);
  await user.clear(screen.getByLabelText('碳水'));
  await user.type(screen.getByLabelText('碳水'), values.carbsGrams);
}

afterEach(cleanup);

describe('TodayPage', () => {
  it('adds a manual meal and shows exact totals', async () => {
    const user = userEvent.setup();
    render(<TodayPage meals={createMemoryMealsRepository()} initialDate={today} />);

    await fillMealForm(user, {
      name: '鸡胸饭',
      amount: '1份',
      caloriesKcal: '620',
      proteinGrams: '42',
      fatGrams: '16',
      carbsGrams: '78',
    });
    await user.click(screen.getByRole('button', { name: '保存餐食' }));

    expect(await screen.findByText('总热量 620 kcal')).toBeInTheDocument();
    expect(screen.getByText('蛋白质 42 g')).toBeInTheDocument();
    expect(screen.getByText('脂肪 16 g')).toBeInTheDocument();
    expect(screen.getByText('碳水 78 g')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '鸡胸饭' })).toBeInTheDocument();
  });

  it('deletes a meal and returns totals to zero', async () => {
    const user = userEvent.setup();
    const repository = createMemoryMealsRepository([
      entry('meal-existing', {
        mealDate: today,
        name: '牛肉饭',
        amount: '1碗',
        nutrition: {
          caloriesKcal: 700,
          proteinGrams: 45,
          fatGrams: 22,
          carbsGrams: 86,
        },
      }),
    ]);

    render(<TodayPage meals={repository} initialDate={today} />);

    expect(await screen.findByText('总热量 700 kcal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除牛肉饭' }));

    expect(await screen.findByText('总热量 0 kcal')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '牛肉饭' })).not.toBeInTheDocument();
    expect(screen.getByText('还没有记录餐食。')).toBeInTheDocument();
  });

  it('keeps the previous rendered meal list when loading another date fails', async () => {
    const user = userEvent.setup();
    const repository: MealsRepository = {
      listByDate: vi.fn(async (mealDate: string) => {
        if (mealDate === '2026-07-15') throw new Error('network detail');
        return {
          meals: [
            entry('meal-stable', {
              mealDate,
              name: '稳定餐',
              amount: '1份',
              nutrition: {
                caloriesKcal: 520,
                proteinGrams: 30,
                fatGrams: 12,
                carbsGrams: 70,
              },
            }),
          ],
          totals: {
            caloriesKcal: 520,
            proteinGrams: 30,
            fatGrams: 12,
            carbsGrams: 70,
          },
        };
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      copy: vi.fn(),
    } as MealsRepository;

    render(<TodayPage meals={repository} initialDate={today} />);

    expect(await screen.findByRole('heading', { name: '稳定餐' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('日期'));
    await user.type(screen.getByLabelText('日期'), '2026-07-15');

    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法加载这一天的餐食，已保留当前列表。');
    expect(screen.getByRole('heading', { name: '稳定餐' })).toBeInTheDocument();
    expect(screen.getByText('总热量 520 kcal')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('network detail');
  });

  it('copies a meal and saves edits through explicit actions', async () => {
    const user = userEvent.setup();
    const repository = createMemoryMealsRepository([
      entry('meal-copy-source', {
        mealDate: today,
        name: '鸡胸饭',
        amount: '1份',
        nutrition: {
          caloriesKcal: 620,
          proteinGrams: 42,
          fatGrams: 16,
          carbsGrams: 78,
        },
      }),
    ]);

    render(<TodayPage meals={repository} initialDate={today} />);

    const sourceCard = await screen.findByRole('article', { name: '鸡胸饭' });
    await user.click(within(sourceCard).getByRole('button', { name: '复制鸡胸饭' }));
    expect(await screen.findByText('总热量 1240 kcal')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '鸡胸饭' })).toHaveLength(2);

    const firstCard = screen.getAllByRole('article', { name: '鸡胸饭' })[0];
    await user.click(within(firstCard).getByRole('button', { name: '编辑鸡胸饭' }));
    await user.clear(screen.getByLabelText('餐食名称'));
    await user.type(screen.getByLabelText('餐食名称'), '鸡胸饭加蛋');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('heading', { name: '鸡胸饭加蛋' })).toBeInTheDocument();
    expect(screen.getByText('总热量 1240 kcal')).toBeInTheDocument();
  });

  it('cancels the current edit when switching dates', async () => {
    const user = userEvent.setup();
    const repository = createMemoryMealsRepository([
      entry('meal-editing', {
        mealDate: today,
        name: '编辑中的饭',
        amount: '1份',
        nutrition: {
          caloriesKcal: 620,
          proteinGrams: 42,
          fatGrams: 16,
          carbsGrams: 78,
        },
      }),
    ]);

    render(<TodayPage meals={repository} initialDate={today} />);

    const mealCard = await screen.findByRole('article', { name: '编辑中的饭' });
    await user.click(within(mealCard).getByRole('button', { name: '编辑编辑中的饭' }));
    expect(screen.getByRole('button', { name: '保存修改' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('日期'));
    await user.type(screen.getByLabelText('日期'), '2026-07-15');

    expect(await screen.findByRole('button', { name: '保存餐食' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存修改' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('餐食名称')).toHaveValue('');
  });
});
