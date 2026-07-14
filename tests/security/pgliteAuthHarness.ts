import { readFile } from 'node:fs/promises';

import { PGlite, type PGliteInterface, type Transaction } from '@electric-sql/pglite';

export type SqlClient = Pick<Transaction, 'exec' | 'query'>;

const migrationUrls = [
  new URL('../../cloud/database/migrations/0001_profiles_and_nutrition_goals.sql', import.meta.url),
  new URL('../../cloud/database/migrations/0002_meals.sql', import.meta.url),
  new URL('../../cloud/database/migrations/0003_weight_workouts.sql', import.meta.url),
  new URL('../../cloud/database/migrations/0004_photo_meal_analysis.sql', import.meta.url),
  new URL('../../cloud/database/migrations/0005_nutrition_goal_history.sql', import.meta.url),
];

export async function createAuthTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')
    $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  return db;
}

export async function applyProductionMigration(db: PGliteInterface): Promise<void> {
  const migrations = await Promise.all(migrationUrls.map((url) => readFile(url, 'utf8')));
  await db.transaction(async (tx) => {
    for (const migration of migrations) {
      await tx.exec(migration);
    }
  });
}

export async function asUser<T>(
  db: PGlite,
  userId: string,
  operation: (client: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return operation(tx);
  });
}

export async function asRole<T>(
  db: PGlite,
  role: 'anon' | 'service_role',
  operation: (client: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return operation(tx);
  });
}

export async function saveSettings(client: SqlClient, payload: unknown): Promise<number> {
  const result = await client.query<{ version: number }>(
    'SELECT public.save_my_profile_settings($1::jsonb) AS version',
    [JSON.stringify(payload)],
  );
  return result.rows[0].version;
}
