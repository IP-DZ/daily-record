// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyProductionMigration,
  asRole,
  asUser,
  createAuthTestDatabase,
  type SqlClient,
} from './pgliteAuthHarness';

const validCreatePayload = {
  mealDate: '2026-07-14',
  name: '鸡胸饭',
  amount: '1份',
  nutrition: {
    caloriesKcal: 620,
    proteinGrams: 42,
    fatGrams: 16,
    carbsGrams: 78,
  },
};

function updatePayload(id: string) {
  return {
    id,
    mealDate: '2026-07-15',
    name: '牛肉饭',
    amount: '1碗',
    nutrition: {
      caloriesKcal: 720,
      proteinGrams: 48,
      fatGrams: 22,
      carbsGrams: 82,
    },
  };
}

async function createMeal(client: SqlClient, payload: unknown = validCreatePayload): Promise<Record<string, unknown>> {
  return (
    await client.query<{ meal: Record<string, unknown> }>('SELECT public.create_my_meal($1::jsonb) AS meal', [
      JSON.stringify(payload),
    ])
  ).rows[0].meal;
}

async function updateMeal(client: SqlClient, payload: unknown): Promise<Record<string, unknown>> {
  return (
    await client.query<{ meal: Record<string, unknown> }>('SELECT public.update_my_meal($1::jsonb) AS meal', [
      JSON.stringify(payload),
    ])
  ).rows[0].meal;
}

async function listMeals(client: SqlClient, mealDate = '2026-07-14'): Promise<Record<string, unknown>> {
  return (
    await client.query<{ result: Record<string, unknown> }>(
      'SELECT public.list_my_meals_by_date($1::text) AS result',
      [mealDate],
    )
  ).rows[0].result;
}

async function deleteMeal(client: SqlClient, id: string): Promise<void> {
  await client.query('SELECT public.delete_my_meal($1::uuid)', [id]);
}

async function copyMeal(client: SqlClient, id: string, mealDate = '2026-07-15'): Promise<Record<string, unknown>> {
  return (
    await client.query<{ meal: Record<string, unknown> }>(
      'SELECT public.copy_my_meal($1::uuid, $2::text) AS meal',
      [id, mealDate],
    )
  ).rows[0].meal;
}

async function countMeals(client: SqlClient): Promise<number> {
  return (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM public.meals')).rows[0].count;
}

describe('meal RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates and lists only the authenticated user meal through RPCs', async () => {
    const meal = await asUser(db, 'user-a', (client) => createMeal(client));

    expect(meal).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      mealDate: '2026-07-14',
      name: '鸡胸饭',
      amount: '1份',
      nutrition: {
        caloriesKcal: 620,
        proteinGrams: 42,
        fatGrams: 16,
        carbsGrams: 78,
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(await asUser(db, 'user-a', (client) => listMeals(client))).toEqual({
      meals: [meal],
      totals: {
        caloriesKcal: 620,
        proteinGrams: 42,
        fatGrams: 16,
        carbsGrams: 78,
      },
    });

    expect(await asUser(db, 'user-b', (client) => listMeals(client))).toEqual({
      meals: [],
      totals: {
        caloriesKcal: 0,
        proteinGrams: 0,
        fatGrams: 0,
        carbsGrams: 0,
      },
    });

    expect(await asRole(db, 'service_role', countMeals)).toBe(1);
  });

  it('denies anonymous and authenticated direct table access', async () => {
    await asUser(db, 'user-a', (client) => createMeal(client));

    await expect(asRole(db, 'anon', (client) => client.query('SELECT * FROM public.meals'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(db, 'user-a', (client) => client.query('SELECT * FROM public.meals'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query(
          `INSERT INTO public.meals
             (user_id, meal_date, name, amount, calories_kcal, protein_grams, fat_grams, carbs_grams)
           VALUES ('user-a', '2026-07-14', 'x', 'y', 1, 1, 1, 1)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('fails foreign and missing mutations without partial writes', async () => {
    const meal = await asUser(db, 'user-a', (client) => createMeal(client));
    const mealId = meal.id as string;
    const missingId = '00000000-0000-0000-0000-000000000000';

    await expect(asUser(db, 'user-b', (client) => deleteMeal(client, mealId))).rejects.toThrow(/meal not found/i);
    await expect(asUser(db, 'user-b', (client) => updateMeal(client, updatePayload(mealId)))).rejects.toThrow(
      /meal not found/i,
    );
    await expect(asUser(db, 'user-b', (client) => copyMeal(client, mealId))).rejects.toThrow(/meal not found/i);

    await expect(asUser(db, 'user-a', (client) => deleteMeal(client, missingId))).rejects.toThrow(/meal not found/i);
    await expect(asUser(db, 'user-a', (client) => updateMeal(client, updatePayload(missingId)))).rejects.toThrow(
      /meal not found/i,
    );
    await expect(asUser(db, 'user-a', (client) => copyMeal(client, missingId))).rejects.toThrow(/meal not found/i);

    expect(await asRole(db, 'service_role', countMeals)).toBe(1);
    expect(await asUser(db, 'user-a', (client) => listMeals(client))).toEqual({
      meals: [meal],
      totals: validCreatePayload.nutrition,
    });
  });

  it('updates, copies, and deletes only own meals atomically', async () => {
    const meal = await asUser(db, 'user-a', (client) => createMeal(client));
    const mealId = meal.id as string;

    const updated = await asUser(db, 'user-a', (client) => updateMeal(client, updatePayload(mealId)));
    expect(updated).toEqual({
      id: mealId,
      mealDate: '2026-07-15',
      name: '牛肉饭',
      amount: '1碗',
      nutrition: {
        caloriesKcal: 720,
        proteinGrams: 48,
        fatGrams: 22,
        carbsGrams: 82,
      },
      createdAt: meal.createdAt,
      updatedAt: expect.any(String),
    });

    const copied = await asUser(db, 'user-a', (client) => copyMeal(client, mealId, '2026-07-16'));
    expect(copied).toEqual({
      ...updated,
      id: expect.not.stringMatching(mealId),
      mealDate: '2026-07-16',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    await asUser(db, 'user-a', (client) => deleteMeal(client, mealId));
    expect(await asUser(db, 'user-a', (client) => listMeals(client, '2026-07-15'))).toEqual({
      meals: [],
      totals: {
        caloriesKcal: 0,
        proteinGrams: 0,
        fatGrams: 0,
        carbsGrams: 0,
      },
    });
    expect(await asRole(db, 'service_role', countMeals)).toBe(1);
  });

  it.each([
    ['non-object payload', null],
    ['extra top-level user_id', { ...validCreatePayload, user_id: 'user-b' }],
    ['extra top-level userId', { ...validCreatePayload, userId: 'user-b' }],
    ['extra top-level email', { ...validCreatePayload, email: 'private@example.invalid' }],
    ['extra top-level savedAt', { ...validCreatePayload, savedAt: '2026-07-14T00:00:00.000Z' }],
    ['empty name', { ...validCreatePayload, name: '' }],
    ['blank amount', { ...validCreatePayload, amount: '   ' }],
    ['bad meal date shape', { ...validCreatePayload, mealDate: '2026-7-14' }],
    ['extra nutrition key', { ...validCreatePayload, nutrition: { ...validCreatePayload.nutrition, sodiumMg: 1 } }],
    ['negative calories', { ...validCreatePayload, nutrition: { ...validCreatePayload.nutrition, caloriesKcal: -1 } }],
  ])('rejects invalid create payload (%s) without partial writes', async (_caseName, payload) => {
    await expect(asUser(db, 'user-a', (client) => createMeal(client, payload))).rejects.toThrow(
      /invalid meal payload/i,
    );

    expect(await asRole(db, 'service_role', countMeals)).toBe(0);
  });

  it.each(['NaN', 'Infinity', '-Infinity'])(
    'rejects non-finite nutrition %s without partial writes',
    async (value) => {
      await expect(
        asUser(db, 'user-a', (client) =>
          client.query(
            `SELECT public.create_my_meal(
               jsonb_set($1::jsonb, '{nutrition,caloriesKcal}', to_jsonb($2::numeric))
             )`,
            [JSON.stringify(validCreatePayload), value],
          ),
        ),
      ).rejects.toThrow(/invalid meal payload/i);

      expect(await asRole(db, 'service_role', countMeals)).toBe(0);
    },
  );

  it('rejects nutrition above the JavaScript finite-number ceiling without partial writes', async () => {
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query(
          `SELECT public.create_my_meal(
             jsonb_set($1::jsonb, '{nutrition,proteinGrams}', $2::jsonb)
           )`,
          [JSON.stringify(validCreatePayload), '1e309'],
        ),
      ),
    ).rejects.toThrow(/invalid meal payload/i);

    expect(await asRole(db, 'service_role', countMeals)).toBe(0);
  });
});
