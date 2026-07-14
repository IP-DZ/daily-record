import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestPlatform } from './createTestPlatform';

const mealDate = '2026-07-14';

function mealInput(
  name: string,
  nutrition: {
    caloriesKcal: number;
    proteinGrams: number;
    fatGrams: number;
    carbsGrams: number;
  },
) {
  return {
    mealDate,
    name,
    amount: '一份',
    nutrition,
  };
}

function responseOf(value: unknown): Response {
  return new Response(JSON.stringify(value));
}

function createAuthFetcher() {
  const sessionByClientId = new Map<string, string | null>();
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      operation?: string;
      clientId?: string;
      email?: string;
    };
    const clientId = body.clientId ?? 'missing-client';
    if (body.operation === 'request-code') return responseOf({});
    if (body.operation === 'verify-code') {
      const userId = body.email === 'b@example.test' ? 'user-b' : 'user-a';
      sessionByClientId.set(clientId, userId);
      return responseOf({ user: { userId } });
    }
    if (body.operation === 'current-user') {
      const userId = sessionByClientId.get(clientId) ?? null;
      return responseOf({ user: userId === null ? null : { userId } });
    }
    if (body.operation === 'sign-out') {
      sessionByClientId.set(clientId, null);
      return responseOf({});
    }
    if (body.operation === 'load-profile') return responseOf({ value: null });
    return new Response('{}', { status: 400 });
  });
}

describe('createTestPlatform', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() { return values.size; },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      } satisfies Storage,
    });
  });

  it('uses one opaque browser client id for auth and profile requests', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { userId: 'user-a' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: null })));
    const platform = createTestPlatform(fetcher);

    await platform.auth.requestEmailCode('a@example.test');
    await platform.auth.verifyEmailCode('a@example.test', '246810');
    await platform.profileSettings.load();

    const payloads = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(new Set(payloads.map(({ clientId }) => clientId)).size).toBe(1);
    expect(payloads.map(({ operation }) => operation)).toEqual(['request-code', 'verify-code', 'load-profile']);
  });

  it('persists the opaque client id for session restore without storing email or code', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: null })));
    await createTestPlatform(fetcher).auth.currentUser();

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe('daily-record:test-platform-client');
    expect(window.localStorage.getItem('daily-record:test-platform-client')).not.toMatch(/@|246810/);
  });

  it('sends profile values without identity metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    const platform = createTestPlatform(fetcher);
    const value = {
      inputs: {
        age: 30, sex: 'male' as const, heightCm: 175, weightKg: 70,
        activityLevel: 'moderate' as const, proteinGramsPerKg: 1.8,
        fatCalorieRatio: 0.25, surplusRatio: 0.1,
      },
      trainingDaysPerWeek: 3,
      trainingExperience: 'intermediate' as const,
      targets: {
        restingKcal: 1648.75, maintenanceKcal: 2555.5625, caloriesKcal: 2811.11875,
        proteinGrams: 126, fatGrams: 78.0866319444, carbsGrams: 401.084765625,
      },
    };

    await platform.profileSettings.save(value);

    const body = String(fetcher.mock.calls[0]?.[1]?.body);
    expect(body).not.toMatch(/user_id|savedAt|email/i);
  });

  it('keeps in-memory meals isolated by the signed-in user and recalculates totals', async () => {
    const platform = createTestPlatform(createAuthFetcher());

    await platform.auth.verifyEmailCode('a@example.test', '246810');
    const aMeal = await platform.meals.create(
      mealInput('鸡胸肉饭', {
        caloriesKcal: 620,
        proteinGrams: 42,
        fatGrams: 16,
        carbsGrams: 78,
      }),
    );
    const aSnack = await platform.meals.create(
      mealInput('酸奶', {
        caloriesKcal: 180,
        proteinGrams: 12,
        fatGrams: 4,
        carbsGrams: 24,
      }),
    );

    await platform.auth.verifyEmailCode('b@example.test', '246810');
    const bMeal = await platform.meals.create(
      mealInput('牛肉饭', {
        caloriesKcal: 700,
        proteinGrams: 45,
        fatGrams: 22,
        carbsGrams: 86,
      }),
    );

    await expect(platform.meals.listByDate(mealDate)).resolves.toMatchObject({
      meals: [bMeal],
      totals: {
        caloriesKcal: 700,
        proteinGrams: 45,
        fatGrams: 22,
        carbsGrams: 86,
      },
    });

    await platform.auth.verifyEmailCode('a@example.test', '246810');
    await expect(platform.meals.listByDate(mealDate)).resolves.toMatchObject({
      meals: [aMeal, aSnack],
      totals: {
        caloriesKcal: 800,
        proteinGrams: 54,
        fatGrams: 20,
        carbsGrams: 102,
      },
    });

    const copied = await platform.meals.copy(aMeal.id, mealDate);
    expect(copied).toMatchObject({
      mealDate,
      name: aMeal.name,
      amount: aMeal.amount,
      nutrition: aMeal.nutrition,
    });
    expect(copied.id).not.toBe(aMeal.id);

    await platform.meals.delete(aSnack.id);

    await expect(platform.meals.listByDate(mealDate)).resolves.toMatchObject({
      meals: [aMeal, copied],
      totals: {
        caloriesKcal: 1240,
        proteinGrams: 84,
        fatGrams: 32,
        carbsGrams: 156,
      },
    });
  });

  it('rejects meal operations when no user is signed in', async () => {
    const platform = createTestPlatform(createAuthFetcher());

    await expect(platform.meals.listByDate(mealDate)).rejects.toThrow(
      'Test platform requires an authenticated user',
    );
  });
});
