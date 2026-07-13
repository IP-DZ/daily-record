import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserDraftSettingsRepository } from './browserDraftSettingsRepository';

const STORAGE_KEY = 'daily-record:onboarding-draft:v1';
const NOW = new Date('2026-07-13T02:03:04.000Z');

const draft = {
  inputs: {
    age: 30,
    sex: 'male' as const,
    heightCm: 175,
    weightKg: 70,
    activityLevel: 'moderate' as const,
    proteinGramsPerKg: 1.8,
    fatCalorieRatio: 0.25,
    surplusRatio: 0.1,
  },
  trainingDaysPerWeek: 3,
  trainingExperience: 'intermediate' as const,
  targets: {
    restingKcal: 1648.75,
    maintenanceKcal: 2555.5625,
    caloriesKcal: 2811.11875,
    proteinGrams: 126,
    fatGrams: 78.0866319444,
    carbsGrams: 401.084765625,
  },
};

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('BrowserDraftSettingsRepository', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('adds the injected timestamp when saving and loads the complete draft', async () => {
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);

    await repository.saveDraft(draft);

    expect(await repository.loadDraft()).toEqual({
      ...draft,
      savedAt: '2026-07-13T02:03:04.000Z',
    });
  });

  it('removes malformed JSON and returns null', async () => {
    storage.setItem(STORAGE_KEY, '{not-json');
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);

    await expect(repository.loadDraft()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['inputs', { ...draft, inputs: { ...draft.inputs, age: 17 } }],
    ['targets', { ...draft, targets: { ...draft.targets, caloriesKcal: '2811' } }],
    ['savedAt', { ...draft, savedAt: 'not-an-iso-timestamp' }],
  ])('removes a draft with invalid %s and returns null', async (_field, invalidDraft) => {
    storage.setItem(STORAGE_KEY, JSON.stringify(invalidDraft));
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);

    await expect(repository.loadDraft()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['trainingDaysPerWeek minimum', { ...draft, trainingDaysPerWeek: 0 }],
    ['trainingDaysPerWeek maximum', { ...draft, trainingDaysPerWeek: 7 }],
    ['beginner experience', { ...draft, trainingExperience: 'beginner' as const }],
    ['advanced experience', { ...draft, trainingExperience: 'advanced' as const }],
  ])('accepts valid %s', async (_case, validDraft) => {
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);
    await repository.saveDraft(validDraft);
    await expect(repository.loadDraft()).resolves.toMatchObject(validDraft);
  });

  it.each([
    ['days below minimum', { ...draft, trainingDaysPerWeek: -1 }],
    ['days above maximum', { ...draft, trainingDaysPerWeek: 8 }],
    ['fractional days', { ...draft, trainingDaysPerWeek: 2.5 }],
    ['unknown experience', { ...draft, trainingExperience: 'expert' }],
  ])('removes a draft with invalid training data: %s', async (_case, invalidDraft) => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...invalidDraft,
      savedAt: NOW.toISOString(),
    }));
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);

    await expect(repository.loadDraft()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('removes a structurally valid draft whose targets do not match its inputs', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...draft,
      targets: { ...draft.targets, caloriesKcal: draft.targets.caloriesKcal + 10 },
      savedAt: NOW.toISOString(),
    }));
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);

    await expect(repository.loadDraft()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('accepts formula targets with harmless persisted floating-point error', async () => {
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);
    await repository.saveDraft({
      ...draft,
      targets: {
        restingKcal: 1648.7500001,
        maintenanceKcal: 2555.5625001,
        caloriesKcal: 2811.1187501,
        proteinGrams: 126.0000001,
        fatGrams: 78.08663195,
        carbsGrams: 401.08476563,
      },
    });

    await expect(repository.loadDraft()).resolves.not.toBeNull();
  });

  it('returns null after clearing the draft', async () => {
    const repository = new BrowserDraftSettingsRepository(storage, () => NOW);
    await repository.saveDraft(draft);

    await repository.clearDraft();

    await expect(repository.loadDraft()).resolves.toBeNull();
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'propagates a Storage %s failure',
    async (method) => {
      const storageError = new DOMException('storage unavailable', 'SecurityError');
      const failingStorage = Object.create(storage) as Storage;
      Object.defineProperty(failingStorage, method, {
        value: () => {
          throw storageError;
        },
      });
      const repository = new BrowserDraftSettingsRepository(failingStorage, () => NOW);

      const operation =
        method === 'getItem'
          ? repository.loadDraft()
          : method === 'setItem'
            ? repository.saveDraft(draft)
            : repository.clearDraft();

      await expect(operation).rejects.toBe(storageError);
    },
  );

  it('propagates removeItem failures encountered while discarding corrupt data', async () => {
    const storageError = new DOMException('storage unavailable', 'SecurityError');
    const failingStorage = {
      getItem: () => '{not-json',
      removeItem: () => {
        throw storageError;
      },
    } as unknown as Storage;
    const repository = new BrowserDraftSettingsRepository(failingStorage, () => NOW);

    await expect(repository.loadDraft()).rejects.toBe(storageError);
  });
});
