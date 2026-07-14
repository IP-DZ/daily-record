import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestPlatform } from './createTestPlatform';

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
});
