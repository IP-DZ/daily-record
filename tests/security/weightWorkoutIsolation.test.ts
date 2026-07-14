// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyProductionMigration,
  asRole,
  asUser,
  createAuthTestDatabase,
  type SqlClient,
} from './pgliteAuthHarness';

const validWeightPayload = {
  entryDate: '2026-07-14',
  weightKg: 70.2,
  note: '晨重',
};

const validWorkoutPayload = {
  workoutDate: '2026-07-14',
  bodyParts: ['胸', '三头'],
  durationMinutes: 60,
  note: '训练状态不错',
  exercises: [
    {
      id: 'client-exercise-1',
      name: '卧推',
      order: 1,
      sets: [
        { id: 'client-set-1', order: 1, weightKg: 60, reps: 8, completed: true },
        { id: 'client-set-2', order: 2, weightKg: 60, reps: 8, completed: false },
      ],
    },
  ],
};

async function createWeight(client: SqlClient, payload: unknown = validWeightPayload): Promise<Record<string, unknown>> {
  return (
    await client.query<{ entry: Record<string, unknown> }>('SELECT public.create_my_weight_entry($1::jsonb) AS entry', [
      JSON.stringify(payload),
    ])
  ).rows[0].entry;
}

async function updateWeight(client: SqlClient, payload: unknown): Promise<Record<string, unknown>> {
  return (
    await client.query<{ entry: Record<string, unknown> }>('SELECT public.update_my_weight_entry($1::jsonb) AS entry', [
      JSON.stringify(payload),
    ])
  ).rows[0].entry;
}

async function listWeights(
  client: SqlClient,
  startDate = '2026-07-01',
  endDate = '2026-07-31',
): Promise<Record<string, unknown>[]> {
  return (
    await client.query<{ entries: Record<string, unknown>[] }>(
      'SELECT public.list_my_weight_entries($1::text, $2::text) AS entries',
      [startDate, endDate],
    )
  ).rows[0].entries;
}

async function deleteWeight(client: SqlClient, id: string): Promise<void> {
  await client.query('SELECT public.delete_my_weight_entry($1::uuid)', [id]);
}

async function createWorkout(
  client: SqlClient,
  payload: unknown = validWorkoutPayload,
): Promise<Record<string, unknown>> {
  return (
    await client.query<{ workout: Record<string, unknown> }>('SELECT public.create_my_workout($1::jsonb) AS workout', [
      JSON.stringify(payload),
    ])
  ).rows[0].workout;
}

async function updateWorkout(client: SqlClient, payload: unknown): Promise<Record<string, unknown>> {
  return (
    await client.query<{ workout: Record<string, unknown> }>('SELECT public.update_my_workout($1::jsonb) AS workout', [
      JSON.stringify(payload),
    ])
  ).rows[0].workout;
}

async function listWorkouts(
  client: SqlClient,
  startDate = '2026-07-01',
  endDate = '2026-07-31',
): Promise<Record<string, unknown>[]> {
  return (
    await client.query<{ workouts: Record<string, unknown>[] }>(
      'SELECT public.list_my_workouts($1::text, $2::text) AS workouts',
      [startDate, endDate],
    )
  ).rows[0].workouts;
}

async function deleteWorkout(client: SqlClient, id: string): Promise<void> {
  await client.query('SELECT public.delete_my_workout($1::uuid)', [id]);
}

async function copyLatestWorkout(client: SqlClient, targetDate = '2026-07-16'): Promise<Record<string, unknown>> {
  return (
    await client.query<{ workout: Record<string, unknown> }>(
      'SELECT public.copy_my_latest_workout($1::text) AS workout',
      [targetDate],
    )
  ).rows[0].workout;
}

async function countUserTables(client: SqlClient): Promise<{
  weightEntries: number;
  workouts: number;
  workoutExercises: number;
  workoutSets: number;
}> {
  return (
    await client.query<{
      weightEntries: number;
      workouts: number;
      workoutExercises: number;
      workoutSets: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.weight_entries) AS "weightEntries",
        (SELECT count(*)::int FROM public.workouts) AS workouts,
        (SELECT count(*)::int FROM public.workout_exercises) AS "workoutExercises",
        (SELECT count(*)::int FROM public.workout_sets) AS "workoutSets"
    `)
  ).rows[0];
}

describe('weight and workout RPC security boundary', () => {
  let db: Awaited<ReturnType<typeof createAuthTestDatabase>>;

  beforeEach(async () => {
    db = await createAuthTestDatabase();
    await applyProductionMigration(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates and lists only the authenticated user weight entries and workouts through RPCs', async () => {
    const weight = await asUser(db, 'user-a', (client) => createWeight(client));
    const workout = await asUser(db, 'user-a', (client) => createWorkout(client));

    expect(weight).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      entryDate: '2026-07-14',
      weightKg: 70.2,
      note: '晨重',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(workout).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      workoutDate: '2026-07-14',
      bodyParts: ['胸', '三头'],
      durationMinutes: 60,
      note: '训练状态不错',
      exercises: [
        {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          name: '卧推',
          order: 1,
          sets: [
            {
              id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
              order: 1,
              weightKg: 60,
              reps: 8,
              completed: true,
            },
            {
              id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
              order: 2,
              weightKg: 60,
              reps: 8,
              completed: false,
            },
          ],
        },
      ],
      volumeKg: 480,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(await asUser(db, 'user-a', (client) => listWeights(client))).toEqual([weight]);
    expect(await asUser(db, 'user-a', (client) => listWorkouts(client))).toEqual([workout]);
    expect(await asUser(db, 'user-b', (client) => listWeights(client))).toEqual([]);
    expect(await asUser(db, 'user-b', (client) => listWorkouts(client))).toEqual([]);

    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 1,
      workouts: 1,
      workoutExercises: 1,
      workoutSets: 2,
    });
  });

  it('denies anonymous and authenticated direct table access', async () => {
    await asUser(db, 'user-a', (client) => createWeight(client));
    await asUser(db, 'user-a', (client) => createWorkout(client));

    for (const table of ['weight_entries', 'workouts', 'workout_exercises', 'workout_sets']) {
      await expect(asRole(db, 'anon', (client) => client.query(`SELECT * FROM public.${table}`))).rejects.toThrow(
        /permission denied/i,
      );
      await expect(
        asUser(db, 'user-a', (client) => client.query(`SELECT * FROM public.${table}`)),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('rejects foreign mutations and leaves rows unchanged', async () => {
    const weight = await asUser(db, 'user-a', (client) => createWeight(client));
    const workout = await asUser(db, 'user-a', (client) => createWorkout(client));

    await expect(asUser(db, 'user-b', (client) => deleteWeight(client, weight.id as string))).rejects.toThrow(
      /weight entry not found/i,
    );
    await expect(
      asUser(db, 'user-b', (client) =>
        updateWeight(client, { ...validWeightPayload, id: weight.id, weightKg: 71 }),
      ),
    ).rejects.toThrow(/weight entry not found/i);
    await expect(asUser(db, 'user-b', (client) => deleteWorkout(client, workout.id as string))).rejects.toThrow(
      /workout not found/i,
    );
    await expect(
      asUser(db, 'user-b', (client) =>
        updateWorkout(client, { ...validWorkoutPayload, id: workout.id, note: '越权' }),
      ),
    ).rejects.toThrow(/workout not found/i);

    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 1,
      workouts: 1,
      workoutExercises: 1,
      workoutSets: 2,
    });
  });

  it.each([
    ['weight with user_id', { ...validWeightPayload, user_id: 'user-b' }, /invalid weight payload/i],
    ['weight with unknown extra key', { ...validWeightPayload, source: 'scale' }, /invalid weight payload/i],
    ['weight below minimum', { ...validWeightPayload, weightKg: 29.9 }, /invalid weight payload/i],
    ['weight note too long', { ...validWeightPayload, note: 'x'.repeat(501) }, /invalid weight payload/i],
    [
      'set with negative weight',
      {
        ...validWorkoutPayload,
        exercises: [
          {
            ...validWorkoutPayload.exercises[0],
            sets: [{ ...validWorkoutPayload.exercises[0].sets[0], weightKg: -1 }],
          },
        ],
      },
      /invalid workout payload/i,
    ],
    ['workout with userId', { ...validWorkoutPayload, userId: 'user-b' }, /invalid workout payload/i],
    ['workout with unknown extra key', { ...validWorkoutPayload, source: 'template' }, /invalid workout payload/i],
    ['empty body part', { ...validWorkoutPayload, bodyParts: ['胸', ''] }, /invalid workout payload/i],
  ])('rejects invalid payload (%s) without partial writes', async (_caseName, payload, message) => {
    const action = 'entryDate' in payload
      ? (client: SqlClient) => createWeight(client, payload)
      : (client: SqlClient) => createWorkout(client, payload);

    await expect(asUser(db, 'user-a', action)).rejects.toThrow(message);

    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 0,
      workouts: 0,
      workoutExercises: 0,
      workoutSets: 0,
    });
  });

  it('rejects update payloads with unknown extra keys without partial writes', async () => {
    const weight = await asUser(db, 'user-a', (client) => createWeight(client));
    const workout = await asUser(db, 'user-a', (client) => createWorkout(client));

    await expect(
      asUser(db, 'user-a', (client) =>
        updateWeight(client, { ...validWeightPayload, id: weight.id, source: 'scale' }),
      ),
    ).rejects.toThrow(/invalid weight payload/i);
    await expect(
      asUser(db, 'user-a', (client) =>
        updateWorkout(client, { ...validWorkoutPayload, id: workout.id, source: 'template' }),
      ),
    ).rejects.toThrow(/invalid workout payload/i);

    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 1,
      workouts: 1,
      workoutExercises: 1,
      workoutSets: 2,
    });
  });

  it('rejects null date parameters instead of silently returning empty results', async () => {
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query('SELECT public.list_my_weight_entries($1::text, $2::text)', [null, '2026-07-31']),
      ),
    ).rejects.toThrow(/invalid weight date range/i);
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query('SELECT public.list_my_workouts($1::text, $2::text)', ['2026-07-01', null]),
      ),
    ).rejects.toThrow(/invalid workout date range/i);
    await expect(
      asUser(db, 'user-a', (client) =>
        client.query('SELECT public.copy_my_latest_workout($1::text)', [null]),
      ),
    ).rejects.toThrow(/invalid workout date/i);
  });

  it('updates and deletes only own rows atomically', async () => {
    const weight = await asUser(db, 'user-a', (client) => createWeight(client));
    const workout = await asUser(db, 'user-a', (client) => createWorkout(client));

    const updatedWeight = await asUser(db, 'user-a', (client) =>
      updateWeight(client, {
        id: weight.id,
        entryDate: '2026-07-15',
        weightKg: 70.8,
        note: '',
      }),
    );
    const updatedWorkout = await asUser(db, 'user-a', (client) =>
      updateWorkout(client, {
        ...validWorkoutPayload,
        id: workout.id,
        workoutDate: '2026-07-15',
        durationMinutes: null,
        exercises: [
          {
            id: 'client-exercise-replacement',
            name: '深蹲',
            order: 1,
            sets: [{ id: 'client-set-replacement', order: 1, weightKg: 100, reps: 5, completed: true }],
          },
        ],
      }),
    );

    expect(updatedWeight).toEqual({
      id: weight.id,
      entryDate: '2026-07-15',
      weightKg: 70.8,
      note: '',
      createdAt: weight.createdAt,
      updatedAt: expect.any(String),
    });
    expect(updatedWorkout).toMatchObject({
      id: workout.id,
      workoutDate: '2026-07-15',
      bodyParts: ['胸', '三头'],
      durationMinutes: null,
      note: '训练状态不错',
      volumeKg: 500,
    });

    await asUser(db, 'user-a', (client) => deleteWeight(client, weight.id as string));
    await asUser(db, 'user-a', (client) => deleteWorkout(client, workout.id as string));

    expect(await asUser(db, 'user-a', (client) => listWeights(client))).toEqual([]);
    expect(await asUser(db, 'user-a', (client) => listWorkouts(client))).toEqual([]);
    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 0,
      workouts: 0,
      workoutExercises: 0,
      workoutSets: 0,
    });
  });

  it('copies only the latest current-user workout before or on target date with new ids and preserved order', async () => {
    const older = await asUser(db, 'user-a', (client) =>
      createWorkout(client, { ...validWorkoutPayload, workoutDate: '2026-07-10', note: '旧训练' }),
    );
    const latest = await asUser(db, 'user-a', (client) =>
      createWorkout(client, {
        ...validWorkoutPayload,
        workoutDate: '2026-07-15',
        note: '最新训练',
        exercises: [
          {
            id: 'client-exercise-1',
            name: '硬拉',
            order: 1,
            sets: [{ id: 'client-set-1', order: 1, weightKg: 120, reps: 3, completed: true }],
          },
          {
            id: 'client-exercise-2',
            name: '划船',
            order: 2,
            sets: [{ id: 'client-set-2', order: 1, weightKg: 70, reps: 10, completed: false }],
          },
        ],
      }),
    );
    await asUser(db, 'user-a', (client) =>
      createWorkout(client, { ...validWorkoutPayload, workoutDate: '2026-07-18', note: '目标日之后' }),
    );
    await asUser(db, 'user-b', (client) =>
      createWorkout(client, { ...validWorkoutPayload, workoutDate: '2026-07-16', note: '其他用户最新' }),
    );

    const copied = await asUser(db, 'user-a', (client) => copyLatestWorkout(client, '2026-07-16'));

    expect(copied).toEqual({
      ...latest,
      id: expect.not.stringMatching(latest.id as string),
      workoutDate: '2026-07-16',
      exercises: [
        {
          ...(latest.exercises as Record<string, unknown>[])[0],
          id: expect.not.stringMatching(((latest.exercises as Record<string, unknown>[])[0].id as string)),
          sets: [
            {
              ...((latest.exercises as Record<string, unknown>[])[0].sets as Record<string, unknown>[])[0],
              id: expect.not.stringMatching(
                (((latest.exercises as Record<string, unknown>[])[0].sets as Record<string, unknown>[])[0]
                  .id as string),
              ),
            },
          ],
        },
        {
          ...(latest.exercises as Record<string, unknown>[])[1],
          id: expect.not.stringMatching(((latest.exercises as Record<string, unknown>[])[1].id as string)),
          sets: [
            {
              ...((latest.exercises as Record<string, unknown>[])[1].sets as Record<string, unknown>[])[0],
              id: expect.not.stringMatching(
                (((latest.exercises as Record<string, unknown>[])[1].sets as Record<string, unknown>[])[0]
                  .id as string),
              ),
            },
          ],
        },
      ],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(copied).not.toMatchObject({ note: older.note });
    expect(await asUser(db, 'user-a', (client) => listWorkouts(client, '2026-07-16', '2026-07-16'))).toEqual([
      copied,
    ]);
    expect(await asRole(db, 'service_role', countUserTables)).toEqual({
      weightEntries: 0,
      workouts: 5,
      workoutExercises: 7,
      workoutSets: 10,
    });
  });
});
