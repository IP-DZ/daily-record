import { describe, expect, it, vi } from 'vitest';

import type { CreateMealInput, MealEntry } from '@daily-record/contracts';
import { MealsRepositoryError } from '../meals';
import { CloudBaseMealsRepository } from './CloudBaseMealsRepository';

const mealDate = '2026-07-14';
const nutrition = {
  caloriesKcal: 620,
  proteinGrams: 42,
  fatGrams: 16,
  carbsGrams: 78,
};
const createInput: CreateMealInput = {
  mealDate,
  name: '鸡胸肉饭',
  amount: '一份',
  nutrition,
};
const meal: MealEntry = {
  id: 'meal-1',
  ...createInput,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};

describe('CloudBaseMealsRepository', () => {
  it('calls owned meal RPCs with validated command payloads and parses responses', async () => {
    const created = { ...meal, id: 'meal-created' };
    const updated = { ...meal, id: 'meal-created', name: '鸡胸肉饭加蛋' };
    const copied = { ...meal, id: 'meal-copy' };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { meals: [meal], totals: nutrition }, error: null })
      .mockResolvedValueOnce({ data: created, error: null })
      .mockResolvedValueOnce({ data: updated, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: copied, error: null });
    const repository = new CloudBaseMealsRepository({ rpc });

    await expect(repository.listByDate(mealDate)).resolves.toEqual({
      meals: [meal],
      totals: nutrition,
    });
    await expect(repository.create(createInput)).resolves.toEqual(created);
    await expect(repository.update({ id: created.id, ...createInput, name: updated.name }))
      .resolves.toEqual(updated);
    await expect(repository.delete(created.id)).resolves.toBeUndefined();
    await expect(repository.copy(created.id, mealDate)).resolves.toEqual(copied);

    expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_meals_by_date', { meal_date: mealDate });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_my_meal', { payload: createInput });
    expect(rpc).toHaveBeenNthCalledWith(3, 'update_my_meal', {
      payload: { id: created.id, ...createInput, name: updated.name },
    });
    expect(rpc).toHaveBeenNthCalledWith(4, 'delete_my_meal', { meal_id: created.id });
    expect(rpc).toHaveBeenNthCalledWith(5, 'copy_my_meal', {
      meal_id: created.id,
      target_meal_date: mealDate,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/userId|user_id|email/i);
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private database detail' } }],
    ['invalid returned meal', { data: { ...meal, name: '' }, error: null }],
  ])('maps %s to a stable safe meals error', async (_case, response) => {
    const repository = new CloudBaseMealsRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.create(createInput).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MealsRepositoryError);
    expect(error).toMatchObject({
      code: 'meals/unavailable',
      message: 'Meals are unavailable',
    });
    expect(String(error)).not.toContain('private database detail');
  });

  it('maps rejected provider calls without exposing provider details', async () => {
    const repository = new CloudBaseMealsRepository({
      rpc: vi.fn().mockRejectedValue(new Error('private SQL error')),
    });

    await expect(repository.listByDate(mealDate)).rejects.toMatchObject({
      code: 'meals/unavailable',
      message: 'Meals are unavailable',
    });
  });
});
