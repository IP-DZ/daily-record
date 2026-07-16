// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyProductionMigration,
  asRole,
  asUser,
  createAuthTestDatabase,
  type SqlClient,
} from './pgliteAuthHarness';

const validCandidate = {
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
};

const validCreatePayload = {
  mealDate: '2026-07-14',
  requestId: 'request-1',
  imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
  candidates: [validCandidate],
  overallConfidence: 0.82,
  questions: [],
  errorCode: null,
};

async function createAnalysis(client: SqlClient, payload: unknown = validCreatePayload): Promise<Record<string, unknown>> {
  return (
    await client.query<{ analysis: Record<string, unknown> }>(
      'SELECT public.create_my_photo_meal_analysis($1::jsonb) AS analysis',
      [JSON.stringify(payload)],
    )
  ).rows[0].analysis;
}

async function getAnalysis(client: SqlClient, id: string): Promise<Record<string, unknown>> {
  return (
    await client.query<{ analysis: Record<string, unknown> }>(
      'SELECT public.get_my_photo_meal_analysis($1::uuid) AS analysis',
      [id],
    )
  ).rows[0].analysis;
}

async function confirmAnalysis(
  client: SqlClient,
  id: string,
  items: unknown = [validCandidate],
): Promise<Record<string, unknown>> {
  return (
    await client.query<{ result: Record<string, unknown> }>(
      'SELECT public.confirm_my_photo_meal_analysis($1::uuid, $2::text, $3::jsonb) AS result',
      [id, '2026-07-14', JSON.stringify(items)],
    )
  ).rows[0].result;
}

async function discardAnalysis(client: SqlClient, id: string): Promise<Record<string, unknown>> {
  return (
    await client.query<{ analysis: Record<string, unknown> }>(
      'SELECT public.discard_my_photo_meal_analysis($1::uuid) AS analysis',
      [id],
    )
  ).rows[0].analysis;
}

async function countMyAnalysesByDate(client: SqlClient, date: string): Promise<number> {
  return (
    await client.query<{ count: number }>(
      'SELECT public.count_my_photo_meal_analyses_by_date($1::text)::int AS count',
      [date],
    )
  ).rows[0].count;
}

async function countRows(client: SqlClient, table: 'ai_analyses' | 'meals'): Promise<number> {
  return (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count;
}

describe('photo meal analysis RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates, reads, confirms, and writes meals only for the authenticated user', async () => {
    const analysis = await asUser(db, 'user-a', (client) => createAnalysis(client));
    const analysisId = analysis.id as string;

    expect(analysis).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      mealDate: '2026-07-14',
      requestId: 'request-1',
      status: 'needs-confirmation',
      candidates: [validCandidate],
      overallConfidence: 0.82,
      questions: [],
      imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
      errorCode: null,
    });
    await expect(asUser(db, 'user-b', (client) => getAnalysis(client, analysisId))).rejects.toThrow(
      /photo meal analysis not found/i,
    );
    expect(await asRole(db, 'service_role', (client) => countRows(client, 'meals'))).toBe(0);

    const result = await asUser(db, 'user-a', (client) => confirmAnalysis(client, analysisId));

    expect(result).toMatchObject({
      analysis: { id: analysisId, status: 'confirmed' },
      meals: [{
        mealDate: '2026-07-14',
        name: '番茄炒蛋盖饭',
        amount: '320克，炒',
        nutrition: validCandidate.nutrition,
      }],
    });
    expect(await asRole(db, 'service_role', (client) => countRows(client, 'meals'))).toBe(1);
  });

  it('is idempotent by user request id and keeps users isolated', async () => {
    const first = await asUser(db, 'user-a', (client) => createAnalysis(client));
    const repeated = await asUser(db, 'user-a', (client) => createAnalysis(client));
    const bAnalysis = await asUser(db, 'user-b', (client) => createAnalysis(client, {
      ...validCreatePayload,
      imageObjectKey: 'users/user-b/photo-meal/request-1/photo.webp',
    }));

    expect(repeated.id).toBe(first.id);
    expect(bAnalysis.id).not.toBe(first.id);
    expect(await asRole(db, 'service_role', (client) => countRows(client, 'ai_analyses'))).toBe(2);
  });

  it('counts only the authenticated user analyses for the requested date', async () => {
    await asUser(db, 'user-a', (client) => createAnalysis(client));
    await asUser(db, 'user-a', (client) => createAnalysis(client, {
      ...validCreatePayload,
      requestId: 'request-2',
      mealDate: '2026-07-15',
      imageObjectKey: 'users/user-a/photo-meal/request-2/photo.webp',
    }));
    await asUser(db, 'user-b', (client) => createAnalysis(client, {
      ...validCreatePayload,
      imageObjectKey: 'users/user-b/photo-meal/request-1/photo.webp',
    }));

    await expect(asUser(db, 'user-a', (client) => countMyAnalysesByDate(client, '2026-07-14'))).resolves.toBe(1);
    await expect(asUser(db, 'user-a', (client) => countMyAnalysesByDate(client, '2026-07-15'))).resolves.toBe(1);
    await expect(asUser(db, 'user-b', (client) => countMyAnalysesByDate(client, '2026-07-14'))).resolves.toBe(1);
    await expect(asUser(db, 'user-a', (client) => countMyAnalysesByDate(client, 'bad-date'))).rejects.toThrow(
      /invalid photo meal analysis date/i,
    );
  });

  it('denies direct access and foreign mutations without partial writes', async () => {
    const analysis = await asUser(db, 'user-a', (client) => createAnalysis(client));
    const analysisId = analysis.id as string;

    await expect(asRole(db, 'anon', (client) => client.query('SELECT * FROM public.ai_analyses'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(db, 'user-a', (client) => client.query('SELECT * FROM public.ai_analyses'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(db, 'user-b', (client) => confirmAnalysis(client, analysisId))).rejects.toThrow(
      /photo meal analysis not found/i,
    );
    expect(await asRole(db, 'service_role', (client) => countRows(client, 'meals'))).toBe(0);
  });

  it('rejects invalid create and confirm payloads without partial writes', async () => {
    await expect(asUser(db, 'user-a', (client) => createAnalysis(client, {
      ...validCreatePayload,
      user_id: 'user-b',
    }))).rejects.toThrow(/invalid photo meal analysis payload/i);
    await expect(asUser(db, 'user-a', (client) => createAnalysis(client, {
      ...validCreatePayload,
      imageObjectKey: 'https://example.com/photo.webp',
    }))).rejects.toThrow(/invalid photo meal analysis payload/i);
    await expect(asUser(db, 'user-a', (client) => createAnalysis(client, {
      ...validCreatePayload,
      candidates: [{ ...validCandidate, confidence: 2 }],
    }))).rejects.toThrow(/invalid photo meal analysis payload/i);

    const analysis = await asUser(db, 'user-a', (client) => createAnalysis(client));
    await expect(asUser(db, 'user-a', (client) => confirmAnalysis(client, analysis.id as string, []))).rejects.toThrow(
      /invalid photo meal confirmation/i,
    );

    expect(await asRole(db, 'service_role', (client) => countRows(client, 'meals'))).toBe(0);
  });

  it('prevents confirming discarded or already confirmed analyses', async () => {
    const discarded = await asUser(db, 'user-a', (client) => createAnalysis(client));
    await asUser(db, 'user-a', (client) => discardAnalysis(client, discarded.id as string));
    await expect(asUser(db, 'user-a', (client) => confirmAnalysis(client, discarded.id as string))).rejects.toThrow(
      /cannot be confirmed/i,
    );

    const confirmed = await asUser(db, 'user-a', (client) => createAnalysis(client, {
      ...validCreatePayload,
      requestId: 'request-2',
      imageObjectKey: 'users/user-a/photo-meal/request-2/photo.webp',
    }));
    await asUser(db, 'user-a', (client) => confirmAnalysis(client, confirmed.id as string));
    await expect(asUser(db, 'user-a', (client) => confirmAnalysis(client, confirmed.id as string))).rejects.toThrow(
      /cannot be confirmed/i,
    );
    expect(await asRole(db, 'service_role', (client) => countRows(client, 'meals'))).toBe(1);
  });
});
