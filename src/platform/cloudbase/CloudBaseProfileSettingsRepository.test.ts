import { describe, expect, it, vi } from 'vitest';

import type { ProfileSettingsDraft } from '@daily-record/contracts';
import {
  CloudBaseProfileSettingsRepository,
  ProfileSettingsError,
} from './CloudBaseProfileSettingsRepository';

const draft: ProfileSettingsDraft = {
  inputs: {
    age: 30,
    sex: 'male',
    heightCm: 175,
    weightKg: 70,
    activityLevel: 'moderate',
    proteinGramsPerKg: 1.8,
    fatCalorieRatio: 0.25,
    surplusRatio: 0.1,
  },
  trainingDaysPerWeek: 3,
  trainingExperience: 'intermediate',
  targets: {
    restingKcal: 1648.75,
    maintenanceKcal: 2555.5625,
    caloriesKcal: 2811.11875,
    proteinGrams: 126,
    fatGrams: 78.0866319444,
    carbsGrams: 401.084765625,
  },
};

describe('CloudBaseProfileSettingsRepository', () => {
  it('saves only the schema-versioned profile payload through the owned RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const repository = new CloudBaseProfileSettingsRepository({ rpc });

    await repository.save(draft);

    expect(rpc).toHaveBeenCalledWith('save_my_profile_settings', {
      payload: { schemaVersion: 1, ...draft },
    });
    const serialized = JSON.stringify(rpc.mock.calls[0]);
    expect(serialized).not.toMatch(/user_id|savedAt|email/i);
  });

  it('loads and validates the shared profile settings schema', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { schemaVersion: 1, ...draft }, error: null });
    const repository = new CloudBaseProfileSettingsRepository({ rpc });

    await expect(repository.load()).resolves.toEqual(draft);
    expect(rpc).toHaveBeenCalledWith('load_my_profile_settings');
  });

  it('returns null when the load RPC has no row', async () => {
    const repository = new CloudBaseProfileSettingsRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    await expect(repository.load()).resolves.toBeNull();
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private database detail' } }],
    ['invalid payload', { data: { schemaVersion: 1, ...draft, email: 'leak@example.com' }, error: null }],
  ])('maps %s to a stable safe settings error', async (_case, response) => {
    const repository = new CloudBaseProfileSettingsRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.load().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ProfileSettingsError);
    expect(error).toMatchObject({ code: 'settings/unavailable', message: 'Profile settings are unavailable' });
    expect(String(error)).not.toContain('private database detail');
    expect(String(error)).not.toContain('leak@example.com');
  });

  it('maps rejected save calls without exposing provider details', async () => {
    const repository = new CloudBaseProfileSettingsRepository({
      rpc: vi.fn().mockRejectedValue(new Error('private SQL error')),
    });

    await expect(repository.save(draft)).rejects.toMatchObject({
      code: 'settings/unavailable',
      message: 'Profile settings are unavailable',
    });
  });
});
