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

const higherSettings = {
  ...settings,
  targets: { ...settings.targets, caloriesKcal: 2900.5, proteinGrams: 145 },
};

async function listGoals(client: SqlClient, startDate: string, endDate: string): Promise<unknown[]> {
  return (
    await client.query<{ goals: unknown[] }>(
      'SELECT public.list_my_nutrition_goals_by_date_range($1::text, $2::text) AS goals',
      [startDate, endDate],
    )
  ).rows[0].goals;
}

async function setEffectiveDate(
  client: SqlClient,
  userId: string,
  version: number,
  effectiveDate: string,
): Promise<void> {
  await client.query(
    'UPDATE public.nutrition_goals SET effective_date = $1::date WHERE user_id = $2 AND version = $3',
    [effectiveDate, userId, version],
  );
}

describe('nutrition goal history RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('lists only current-user goal versions needed to cover a date range', async () => {
    await asUser(db, 'user-a', (client) => saveSettings(client, settings));
    await asUser(db, 'user-a', (client) => saveSettings(client, higherSettings));
    await asUser(db, 'user-b', (client) => saveSettings(client, {
      ...settings,
      targets: { ...settings.targets, caloriesKcal: 1999 },
    }));
    await asRole(db, 'service_role', async (client) => {
      await setEffectiveDate(client, 'user-a', 1, '2026-07-01');
      await setEffectiveDate(client, 'user-a', 2, '2026-07-10');
      await setEffectiveDate(client, 'user-b', 1, '2026-07-05');
    });

    await expect(asUser(db, 'user-a', (client) => listGoals(client, '2026-07-08', '2026-07-14')))
      .resolves.toEqual([
        {
          version: 1,
          effectiveDate: '2026-07-01',
          targets: settings.targets,
          createdAt: expect.any(String),
        },
        {
          version: 2,
          effectiveDate: '2026-07-10',
          targets: higherSettings.targets,
          createdAt: expect.any(String),
        },
      ]);

    await expect(asUser(db, 'user-b', (client) => listGoals(client, '2026-07-08', '2026-07-14')))
      .resolves.toEqual([
        {
          version: 1,
          effectiveDate: '2026-07-05',
          targets: { ...settings.targets, caloriesKcal: 1999 },
          createdAt: expect.any(String),
        },
      ]);
  });

  it('returns an empty list when no current-user goal covers the range', async () => {
    await asUser(db, 'user-a', (client) => saveSettings(client, settings));
    await asRole(db, 'service_role', (client) => setEffectiveDate(client, 'user-a', 1, '2026-07-20'));

    await expect(asUser(db, 'user-a', (client) => listGoals(client, '2026-07-01', '2026-07-14')))
      .resolves.toEqual([]);
  });

  it('denies direct table access and rejects invalid ranges', async () => {
    await asUser(db, 'user-a', (client) => saveSettings(client, settings));

    await expect(asUser(db, 'user-a', (client) => client.query('SELECT * FROM public.nutrition_goals')))
      .rejects.toThrow(/permission denied/i);
    await expect(asUser(db, 'user-a', (client) => listGoals(client, '2026-7-01', '2026-07-14')))
      .rejects.toThrow(/invalid date range/i);
    await expect(asUser(db, 'user-a', (client) => listGoals(client, '2026-07-14', '2026-07-01')))
      .rejects.toThrow(/invalid date range/i);
  });
});
