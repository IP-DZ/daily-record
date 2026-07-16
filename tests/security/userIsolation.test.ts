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

const firstSettings = {
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

const secondSettings = {
  ...firstSettings,
  trainingDaysPerWeek: 5,
  targets: { ...firstSettings.targets, caloriesKcal: 2800.75 },
};

async function loadSettings(client: SqlClient): Promise<unknown> {
  return (await client.query<{ settings: unknown }>('SELECT public.load_my_profile_settings() AS settings'))
    .rows[0].settings;
}

async function inspectRows(client: SqlClient) {
  return {
    profiles: (
      await client.query<{ user_id: string; goal_version: number; payload: unknown }>(
        'SELECT user_id, goal_version, payload FROM public.profiles ORDER BY user_id',
      )
    ).rows,
    goals: (
      await client.query<{ user_id: string; version: number; payload: unknown }>(
        'SELECT user_id, version, payload FROM public.nutrition_goals ORDER BY user_id, version',
      )
    ).rows,
  };
}

describe('profile settings RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it.each([
    ['read', "SELECT * FROM public.profiles WHERE user_id = 'user-a'", "SELECT * FROM public.profiles WHERE user_id = 'user-b'"],
    ['insert', `INSERT INTO public.profiles (user_id, payload) VALUES ('user-a', '{"schemaVersion":1}'::jsonb)`, `INSERT INTO public.profiles (user_id, payload) VALUES ('user-b', '{"schemaVersion":1}'::jsonb)`],
    ['update', `UPDATE public.profiles SET payload = '{"schemaVersion":1}'::jsonb WHERE user_id = 'user-a'`, `UPDATE public.profiles SET payload = '{"schemaVersion":1}'::jsonb WHERE user_id = 'user-b'`],
    ['delete', "DELETE FROM public.profiles WHERE user_id = 'user-a'", "DELETE FROM public.profiles WHERE user_id = 'user-b'"],
    ['goal read', "SELECT * FROM public.nutrition_goals WHERE user_id = 'user-a'", "SELECT * FROM public.nutrition_goals WHERE user_id = 'user-b'"],
    ['goal insert', `INSERT INTO public.nutrition_goals (user_id, version, payload) VALUES ('user-a', 99, '{}'::jsonb)`, `INSERT INTO public.nutrition_goals (user_id, version, payload) VALUES ('user-b', 99, '{}'::jsonb)`],
    ['goal update', `UPDATE public.nutrition_goals SET payload = '{}'::jsonb WHERE user_id = 'user-a'`, `UPDATE public.nutrition_goals SET payload = '{}'::jsonb WHERE user_id = 'user-b'`],
    ['goal delete', "DELETE FROM public.nutrition_goals WHERE user_id = 'user-a'", "DELETE FROM public.nutrition_goals WHERE user_id = 'user-b'"],
  ])('denies authenticated direct table %s for own and cross-user rows', async (_name, ownSql, crossSql) => {
    await asUser(db, 'user-a', (client) => saveSettings(client, firstSettings));
    await expect(asUser(db, 'user-a', (client) => client.query(ownSql))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, 'user-a', (client) => client.query(crossSql))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, 'user-b', (client) => client.query(ownSql))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, 'user-b', (client) => client.query(crossSql))).rejects.toThrow(/permission denied/i);
  });

  it('isolates A and B through RPCs while service_role is used only for test inspection', async () => {
    expect(await asUser(db, 'user-a', loadSettings)).toBeNull();
    expect(await asUser(db, 'user-b', loadSettings)).toBeNull();

    expect(await asUser(db, 'user-a', (client) => saveSettings(client, firstSettings))).toBe(1);
    expect(await asUser(db, 'user-b', (client) => saveSettings(client, secondSettings))).toBe(1);
    expect(await asUser(db, 'user-a', loadSettings)).toEqual(firstSettings);
    expect(await asUser(db, 'user-b', loadSettings)).toEqual(secondSettings);

    expect(await asUser(db, 'user-a', (client) => saveSettings(client, secondSettings))).toBe(2);
    const state = await asRole(db, 'service_role', inspectRows);
    expect(state.profiles).toEqual([
      expect.objectContaining({ user_id: 'user-a', goal_version: 2, payload: secondSettings }),
      expect.objectContaining({ user_id: 'user-b', goal_version: 1, payload: secondSettings }),
    ]);
    expect(state.goals.map(({ user_id, version }) => [user_id, version])).toEqual([
      ['user-a', 1],
      ['user-a', 2],
      ['user-b', 1],
    ]);
  });

  it('denies anonymous table and RPC access', async () => {
    await expect(asRole(db, 'anon', (client) => client.query('SELECT * FROM public.profiles'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asRole(db, 'anon', (client) => saveSettings(client, firstSettings))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('rejects an empty session identity', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE authenticated');
        return saveSettings(tx, firstSettings);
      }),
    ).rejects.toThrow(/authenticated user is required/i);
  });

  it.each([
    ['all lower bounds', {
      ...firstSettings,
      inputs: {
        ...firstSettings.inputs,
        age: 18,
        heightCm: 100,
        weightKg: 30,
        activityLevel: 'sedentary',
        proteinGramsPerKg: 1.6,
        fatCalorieRatio: 0.15,
        surplusRatio: 0,
      },
      trainingDaysPerWeek: 0,
      trainingExperience: 'beginner',
      targets: Object.fromEntries(Object.keys(firstSettings.targets).map((key) => [key, 0])),
    }],
    ['all upper bounds', {
      ...firstSettings,
      inputs: {
        ...firstSettings.inputs,
        age: 100,
        sex: 'female',
        heightCm: 250,
        weightKg: 350,
        activityLevel: 'veryHigh',
        proteinGramsPerKg: 2.2,
        fatCalorieRatio: 0.4,
        surplusRatio: 0.3,
      },
      trainingDaysPerWeek: 7,
      trainingExperience: 'advanced',
    }],
    ['JavaScript maximum finite targets', {
      ...firstSettings,
      targets: Object.fromEntries(
        Object.keys(firstSettings.targets).map((key) => [key, Number.MAX_VALUE]),
      ),
    }],
  ])('accepts shared-contract boundary payloads (%s)', async (_caseName, payload) => {
    await expect(asUser(db, 'user-a', (client) => saveSettings(client, payload))).resolves.toBe(1);
  });

  it.each([
    ['missing required settings fields', { schemaVersion: 1, targets: {} }],
    ['wrong target value type', { ...firstSettings, targets: { ...firstSettings.targets, caloriesKcal: '2800' } }],
    ['extra top-level user_id', { ...firstSettings, user_id: 'user-b' }],
    ['extra top-level email', { ...firstSettings, email: 'private@example.invalid' }],
    ['extra top-level savedAt', { ...firstSettings, savedAt: '2026-07-13' }],
    ['extra input field', { ...firstSettings, inputs: { ...firstSettings.inputs, extra: true } }],
    ['extra target field', { ...firstSettings, targets: { ...firstSettings.targets, extra: 1 } }],
    ['wrong schema version', { ...firstSettings, schemaVersion: 2 }],
    ['fractional age', { ...firstSettings, inputs: { ...firstSettings.inputs, age: 30.5 } }],
    ['age below range', { ...firstSettings, inputs: { ...firstSettings.inputs, age: 17 } }],
    ['invalid sex', { ...firstSettings, inputs: { ...firstSettings.inputs, sex: 'other' } }],
    ['height above range', { ...firstSettings, inputs: { ...firstSettings.inputs, heightCm: 251 } }],
    ['weight below range', { ...firstSettings, inputs: { ...firstSettings.inputs, weightKg: 29 } }],
    ['invalid activity', { ...firstSettings, inputs: { ...firstSettings.inputs, activityLevel: 'extreme' } }],
    ['protein below range', { ...firstSettings, inputs: { ...firstSettings.inputs, proteinGramsPerKg: 1.59 } }],
    ['fat ratio above range', { ...firstSettings, inputs: { ...firstSettings.inputs, fatCalorieRatio: 0.41 } }],
    ['surplus below range', { ...firstSettings, inputs: { ...firstSettings.inputs, surplusRatio: -0.01 } }],
    ['fractional training days', { ...firstSettings, trainingDaysPerWeek: 4.5 }],
    ['training days above range', { ...firstSettings, trainingDaysPerWeek: 8 }],
    ['invalid experience', { ...firstSettings, trainingExperience: 'expert' }],
    ['negative target', { ...firstSettings, targets: { ...firstSettings.targets, carbsGrams: -1 } }],
  ])('rejects invalid shared-contract payload (%s) without partial writes', async (_caseName, malformedPayload) => {
    await expect(asUser(db, 'user-a', (client) => saveSettings(client, malformedPayload))).rejects.toThrow(
      /invalid profile settings payload/i,
    );

    expect(await asRole(db, 'service_role', inspectRows)).toEqual({ profiles: [], goals: [] });
  });

  it.each(['NaN', 'Infinity', '-Infinity'])('rejects a non-finite target (%s) without partial writes', async (value) => {
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query(
          `SELECT public.save_my_profile_settings(
             jsonb_set($1::jsonb, '{targets,caloriesKcal}', to_jsonb($2::numeric))
           )`,
          [JSON.stringify(firstSettings), value],
        ),
      ),
    ).rejects.toThrow(/invalid profile settings payload/i);

    expect(await asRole(db, 'service_role', inspectRows)).toEqual({ profiles: [], goals: [] });
  });

  it.each(Object.keys(firstSettings.targets))(
    'rejects target %s above the JavaScript finite-number ceiling without partial writes',
    async (targetField) => {
      await expect(
        asUser(db, 'user-a', (client) =>
          client.query(
            `SELECT public.save_my_profile_settings(
               jsonb_set($1::jsonb, '{targets,${targetField}}', $2::jsonb)
             )`,
            [JSON.stringify(firstSettings), '1e309'],
          ),
        ),
      ).rejects.toThrow(/invalid profile settings payload/i);

      expect(await asRole(db, 'service_role', inspectRows)).toEqual({ profiles: [], goals: [] });
    },
  );
});
