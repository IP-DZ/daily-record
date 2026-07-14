// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyProductionMigration, createAuthTestDatabase } from './pgliteAuthHarness';

function expectOwnUserPredicate(expression: string | null): void {
  expect(expression).toEqual(expect.stringMatching(/user_id\s*=.*auth\.uid\s*\(\s*\)/is));
}

describe('production migration security shape', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('enables RLS and defines all four own-row policies on all user tables', async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('profiles', 'nutrition_goals', 'meals')
      ORDER BY relname
    `);
    expect(tables.rows).toEqual([
      { relname: 'meals', relrowsecurity: true },
      { relname: 'nutrition_goals', relrowsecurity: true },
      { relname: 'profiles', relrowsecurity: true },
    ]);

    const policies = await db.query<{ tablename: string; cmd: string; qual: string | null; with_check: string | null }>(`
      SELECT tablename, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('profiles', 'nutrition_goals', 'meals')
      ORDER BY tablename, cmd
    `);
    for (const table of ['profiles', 'nutrition_goals', 'meals']) {
      const tablePolicies = Object.fromEntries(
        policies.rows
          .filter(({ tablename }) => tablename === table)
          .map((policy) => [policy.cmd, policy]),
      );
      expect(Object.keys(tablePolicies).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

      expectOwnUserPredicate(tablePolicies.SELECT.qual);
      expect(tablePolicies.SELECT.with_check).toBeNull();
      expect(tablePolicies.INSERT.qual).toBeNull();
      expectOwnUserPredicate(tablePolicies.INSERT.with_check);
      expectOwnUserPredicate(tablePolicies.UPDATE.qual);
      expectOwnUserPredicate(tablePolicies.UPDATE.with_check);
      expectOwnUserPredicate(tablePolicies.DELETE.qual);
      expect(tablePolicies.DELETE.with_check).toBeNull();
    }
  });

  it('grants anon and authenticated no direct table or column privileges', async () => {
    const tablePrivileges = await db.query<{ grantee: string; privilege_type: string }>(`
      SELECT grantee, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee IN ('anon', 'authenticated')
        AND table_schema = 'public'
        AND table_name IN ('profiles', 'nutrition_goals', 'meals')
    `);
    expect(tablePrivileges.rows).toEqual([]);

    const columnPrivileges = await db.query<{ grantee: string; privilege_type: string }>(`
      SELECT grantee, privilege_type
      FROM information_schema.column_privileges
      WHERE grantee IN ('anon', 'authenticated')
        AND table_schema = 'public'
        AND table_name IN ('profiles', 'nutrition_goals', 'meals')
    `);
    expect(columnPrivileges.rows).toEqual([]);
  });

  it('uses definer RPCs with fixed search paths, auth-only execution, and no user_id argument', async () => {
    const functions = await db.query<{
      proname: string;
      prosecdef: boolean;
      arguments: string;
      proconfig: string[] | null;
    }>(`
      SELECT p.proname,
             p.prosecdef,
             pg_get_function_arguments(p.oid) AS arguments,
             p.proconfig
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN (
          'save_my_profile_settings',
          'load_my_profile_settings',
          'list_my_meals_by_date',
          'create_my_meal',
          'update_my_meal',
          'delete_my_meal',
          'copy_my_meal'
        )
      ORDER BY p.proname
    `);
    expect(functions.rows).toHaveLength(7);
    for (const fn of functions.rows) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=pg_catalog, public, auth');
      expect(fn.arguments).not.toMatch(/user_id/i);
    }
    expect(functions.rows.find(({ proname }) => proname === 'save_my_profile_settings')?.arguments).toBe(
      'payload jsonb',
    );
    expect(functions.rows.find(({ proname }) => proname === 'list_my_meals_by_date')?.arguments).toBe(
      'meal_date text',
    );
    expect(functions.rows.find(({ proname }) => proname === 'create_my_meal')?.arguments).toBe('payload jsonb');
    expect(functions.rows.find(({ proname }) => proname === 'update_my_meal')?.arguments).toBe('payload jsonb');
    expect(functions.rows.find(({ proname }) => proname === 'delete_my_meal')?.arguments).toBe('meal_id uuid');
    expect(functions.rows.find(({ proname }) => proname === 'copy_my_meal')?.arguments).toBe(
      'meal_id uuid, target_meal_date text',
    );

    const executePrivileges = await db.query<{ grantee: string; routine_name: string }>(`
      SELECT grantee, routine_name
      FROM information_schema.role_routine_grants
      WHERE specific_schema = 'public'
        AND routine_name IN (
          'save_my_profile_settings',
          'load_my_profile_settings',
          'list_my_meals_by_date',
          'create_my_meal',
          'update_my_meal',
          'delete_my_meal',
          'copy_my_meal'
        )
        AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
      ORDER BY grantee, routine_name
    `);
    expect(executePrivileges.rows).toEqual([
      { grantee: 'authenticated', routine_name: 'copy_my_meal' },
      { grantee: 'authenticated', routine_name: 'create_my_meal' },
      { grantee: 'authenticated', routine_name: 'delete_my_meal' },
      { grantee: 'authenticated', routine_name: 'list_my_meals_by_date' },
      { grantee: 'authenticated', routine_name: 'load_my_profile_settings' },
      { grantee: 'authenticated', routine_name: 'save_my_profile_settings' },
      { grantee: 'authenticated', routine_name: 'update_my_meal' },
    ]);
  });

  it('fails clearly and leaves the first application intact when rerun', async () => {
    await expect(applyProductionMigration(db)).rejects.toThrow(/already exists/i);
    const shape = await db.query<{ tables: number; policies: number }>(`
      SELECT
        (SELECT count(*)::int FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('profiles', 'nutrition_goals', 'meals')) AS tables,
        (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profiles', 'nutrition_goals', 'meals')) AS policies
    `);
    expect(shape.rows[0]).toEqual({ tables: 3, policies: 12 });
  });
});
