import type { z } from 'zod';

export type OfflineDraftIdentity =
  | { kind: 'guest' }
  | { kind: 'user'; userId: string };

export interface OfflineDraftRepository<TDraft> {
  load(): Promise<TDraft | null>;
  save(draft: TDraft): Promise<void>;
  clear(): Promise<void>;
}

type BrowserOfflineDraftRepositoryOptions<TDraft> = {
  identity: OfflineDraftIdentity;
  pageKey: string;
  schemaVersion: number;
  schema: z.ZodType<TDraft>;
};

function identitySegment(identity: OfflineDraftIdentity): string {
  if (identity.kind === 'guest') return 'guest';
  return `user:${encodeURIComponent(identity.userId)}`;
}

function storageKeyFor<TDraft>({
  identity,
  pageKey,
  schemaVersion,
}: BrowserOfflineDraftRepositoryOptions<TDraft>): string {
  return `daily-record:offline-draft:v${schemaVersion}:${identitySegment(identity)}:page:${encodeURIComponent(pageKey)}`;
}

export class BrowserOfflineDraftRepository<TDraft> implements OfflineDraftRepository<TDraft> {
  constructor(
    private readonly storage: Storage,
    private readonly options: BrowserOfflineDraftRepositoryOptions<TDraft>,
  ) {
    this.storageKey = storageKeyFor(options);
  }

  private readonly storageKey: string;

  async load(): Promise<TDraft | null> {
    const rawDraft = this.storage.getItem(this.storageKey);
    if (rawDraft === null) return null;

    let decodedDraft: unknown;
    try {
      decodedDraft = JSON.parse(rawDraft);
    } catch {
      this.storage.removeItem(this.storageKey);
      return null;
    }

    const parsedDraft = this.options.schema.safeParse(decodedDraft);
    if (!parsedDraft.success) {
      this.storage.removeItem(this.storageKey);
      return null;
    }

    return parsedDraft.data;
  }

  async save(draft: TDraft): Promise<void> {
    const parsedDraft = this.options.schema.parse(draft);
    this.storage.setItem(this.storageKey, JSON.stringify(parsedDraft));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.storageKey);
  }
}
