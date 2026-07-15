import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserOfflineDraftRepository } from './BrowserOfflineDraftRepository';

const draftSchema = z.object({
  field: z.string(),
  count: z.number().int().nonnegative(),
}).strict();

type Draft = z.infer<typeof draftSchema>;

const STORAGE_KEY = `daily-record:offline-draft:v1:user:${encodeURIComponent('user/a@example.test')}:page:today-meal`;

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

function createRepository(storage: Storage, userId = 'user/a@example.test') {
  return new BrowserOfflineDraftRepository<Draft>(storage, {
    identity: { kind: 'user', userId },
    pageKey: 'today-meal',
    schemaVersion: 1,
    schema: draftSchema,
  });
}

describe('BrowserOfflineDraftRepository', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('stores drafts in a key scoped by schema version, user and page', async () => {
    const repository = createRepository(storage);

    await repository.save({ field: '鸡胸饭', count: 1 });

    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ field: '鸡胸饭', count: 1 }));
    await expect(repository.load()).resolves.toEqual({ field: '鸡胸饭', count: 1 });
  });

  it('does not enumerate or fall back to another user namespace', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ field: '用户 A 草稿', count: 1 }));
    const userBRepository = createRepository(storage, 'user-b');

    await expect(userBRepository.load()).resolves.toBeNull();
  });

  it('clears only the selected user and page draft', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ field: '用户 A 草稿', count: 1 }));
    storage.setItem('daily-record:offline-draft:v1:user:user-b:page:today-meal', 'keep');
    const repository = createRepository(storage);

    await repository.clear();

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem('daily-record:offline-draft:v1:user:user-b:page:today-meal')).toBe('keep');
  });

  it('removes malformed JSON and invalid draft shapes instead of returning them', async () => {
    storage.setItem(STORAGE_KEY, '{not-json');
    await expect(createRepository(storage).load()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();

    storage.setItem(STORAGE_KEY, JSON.stringify({ field: 'ok', count: -1 }));
    await expect(createRepository(storage).load()).resolves.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects extra sensitive-looking fields and leaves storage unchanged', async () => {
    const repository = createRepository(storage);

    await expect(
      repository.save({
        field: 'ok',
        count: 1,
        token: 'browser-token-should-never-be-persisted',
      } as Draft),
    ).rejects.toThrow();

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
