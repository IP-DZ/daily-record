// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyProductionMigration,
  asRole,
  asUser,
  createAuthTestDatabase,
  saveSettings,
  type SqlClient,
} from './pgliteAuthHarness';

const settings = {
  schemaVersion: 1,
  inputs: {
    age: 30,
    sex: 'male',
    heightCm: 178,
    weightKg: 76.5,
    activityLevel: 'moderate',
    proteinGramsPerKg: 1.8,
    fatCalorieRatio: 0.25,
    surplusRatio: 0.1,
  },
  trainingDaysPerWeek: 4,
  trainingExperience: 'intermediate',
  targets: {
    restingKcal: 1800.25,
    maintenanceKcal: 2500.5,
    caloriesKcal: 2750.55,
    proteinGrams: 137.7,
    fatGrams: 76.4,
    carbsGrams: 378.2,
  },
};

const mealPayload = {
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

const weightPayload = {
  entryDate: '2026-07-14',
  weightKg: 70.4,
  note: '晨重',
};

const workoutPayload = {
  workoutDate: '2026-07-14',
  bodyParts: ['胸'],
  durationMinutes: 60,
  note: '',
  exercises: [{
    id: 'exercise-1',
    name: '卧推',
    order: 1,
    sets: [{ id: 'set-1', order: 1, weightKg: 60, reps: 8, completed: true }],
  }],
};

const analysisPayload = {
  mealDate: '2026-07-14',
  requestId: 'request-1',
  imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
  candidates: [{
    id: 'candidate-1',
    name: '番茄炒蛋盖饭',
    estimatedGrams: 320,
    cookingMethod: '炒',
    nutrition: {
      caloriesKcal: 520,
      proteinGrams: 28,
      fatGrams: 18,
      carbsGrams: 62,
    },
    confidence: 0.82,
    questions: [],
  }],
  overallConfidence: 0.82,
  questions: [],
  errorCode: null,
};

async function createOwnedRecords(client: SqlClient, imageUserId: string): Promise<{ analysisId: string }> {
  await saveSettings(client, settings);
  await client.query('SELECT public.create_my_meal($1::jsonb)', [JSON.stringify(mealPayload)]);
  await client.query('SELECT public.create_my_weight_entry($1::jsonb)', [JSON.stringify(weightPayload)]);
  await client.query('SELECT public.create_my_workout($1::jsonb)', [JSON.stringify(workoutPayload)]);
  const analysis = (
    await client.query<{ analysis: Record<string, unknown> }>(
      'SELECT public.create_my_photo_meal_analysis($1::jsonb) AS analysis',
      [JSON.stringify({
        ...analysisPayload,
        imageObjectKey: `users/${imageUserId}/photo-meal/request-1/photo.webp`,
      })],
    )
  ).rows[0].analysis;
  return { analysisId: analysis.id as string };
}

async function deleteMyApplicationData(client: SqlClient): Promise<unknown> {
  return (await client.query<{ result: unknown }>('SELECT public.delete_my_application_data() AS result'))
    .rows[0].result;
}

async function counts(client: SqlClient) {
  return (
    await client.query<{
      profiles: number;
      nutrition_goals: number;
      meals: number;
      weight_entries: number;
      workouts: number;
      workout_exercises: number;
      workout_sets: number;
      ai_analyses: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.profiles) AS profiles,
        (SELECT count(*)::int FROM public.nutrition_goals) AS nutrition_goals,
        (SELECT count(*)::int FROM public.meals) AS meals,
        (SELECT count(*)::int FROM public.weight_entries) AS weight_entries,
        (SELECT count(*)::int FROM public.workouts) AS workouts,
        (SELECT count(*)::int FROM public.workout_exercises) AS workout_exercises,
        (SELECT count(*)::int FROM public.workout_sets) AS workout_sets,
        (SELECT count(*)::int FROM public.ai_analyses) AS ai_analyses
    `)
  ).rows[0];
}

describe('delete_my_application_data RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('deletes only the current authenticated user application data', async () => {
    const userA = await asUser(db, 'user-a', (client) => createOwnedRecords(client, 'user-a'));
    const userB = await asUser(db, 'user-b', (client) => createOwnedRecords(client, 'user-b'));
    expect(await asRole(db, 'service_role', counts)).toEqual({
      profiles: 2,
      nutrition_goals: 2,
      meals: 2,
      weight_entries: 2,
      workouts: 2,
      workout_exercises: 2,
      workout_sets: 2,
      ai_analyses: 2,
    });

    await expect(asUser(db, 'user-a', deleteMyApplicationData)).resolves.toEqual({ deleted: true });

    expect(await asRole(db, 'service_role', counts)).toEqual({
      profiles: 1,
      nutrition_goals: 1,
      meals: 1,
      weight_entries: 1,
      workouts: 1,
      workout_exercises: 1,
      workout_sets: 1,
      ai_analyses: 1,
    });
    await expect(
      asUser(db, 'user-a', (client) => client.query('SELECT public.load_my_profile_settings() AS settings')),
    ).resolves.toMatchObject({ rows: [{ settings: null }] });
    await expect(
      asUser(db, 'user-a', (client) => client.query('SELECT public.get_my_photo_meal_analysis($1::uuid)', [
        userA.analysisId,
      ])),
    ).rejects.toThrow(/photo meal analysis not found/i);

    await expect(
      asUser(db, 'user-b', (client) => client.query('SELECT public.get_my_photo_meal_analysis($1::uuid)', [
        userB.analysisId,
      ])),
    ).resolves.toBeDefined();
  });

  it('does not accept a user_id argument and requires an authenticated session', async () => {
    await expect(
      asUser(db, 'user-a', (client) => client.query(
        "SELECT public.delete_my_application_data('user-b'::text)",
      )),
    ).rejects.toThrow();

    await expect(
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE authenticated');
        return deleteMyApplicationData(tx);
      }),
    ).rejects.toThrow(/authenticated user is required/i);
  });
});
