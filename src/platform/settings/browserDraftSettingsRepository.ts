import { z } from 'zod';

import {
  calculateNutritionTargets,
  nutritionInputsSchema,
  type NutritionTargets,
} from '../../domain/nutrition';
import type { SettingsRepository } from './SettingsRepository';
import type { OnboardingDraft, OnboardingDraftInput } from './onboardingTypes';

const DRAFT_STORAGE_PREFIX = 'daily-record:onboarding-draft:v2:';
const TARGET_TOLERANCE = 1e-6;

const nutritionTargetsSchema = z
  .object({
    restingKcal: z.number().finite().nonnegative(),
    maintenanceKcal: z.number().finite().nonnegative(),
    caloriesKcal: z.number().finite().nonnegative(),
    proteinGrams: z.number().finite().nonnegative(),
    fatGrams: z.number().finite().nonnegative(),
    carbsGrams: z.number().finite().nonnegative(),
  })
  .strict();

const onboardingDraftSchema = z
  .object({
    inputs: nutritionInputsSchema,
    trainingDaysPerWeek: z.number().int().min(0).max(7),
    trainingExperience: z.enum(['beginner', 'intermediate', 'advanced']),
    targets: nutritionTargetsSchema,
    savedAt: z.iso.datetime(),
  })
  .strict();

function targetsMatch(expected: NutritionTargets, actual: NutritionTargets) {
  return (Object.keys(expected) as (keyof NutritionTargets)[]).every(
    (key) => Math.abs(expected[key] - actual[key]) <= TARGET_TOLERANCE,
  );
}

export type DraftStorageIdentity =
  | { kind: 'guest' }
  | { kind: 'user'; userId: string };

function storageKeyFor(identity: DraftStorageIdentity): string {
  if (identity.kind === 'guest') return `${DRAFT_STORAGE_PREFIX}guest`;
  return `${DRAFT_STORAGE_PREFIX}user:${encodeURIComponent(identity.userId)}`;
}

export class BrowserDraftSettingsRepository implements SettingsRepository {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => Date,
    identity: DraftStorageIdentity = { kind: 'guest' },
  ) {
    this.storageKey = storageKeyFor(identity);
  }

  private readonly storageKey: string;

  async saveDraft(draft: OnboardingDraftInput): Promise<void> {
    const persistedDraft: OnboardingDraft = {
      ...draft,
      savedAt: this.now().toISOString(),
    };

    this.storage.setItem(this.storageKey, JSON.stringify(persistedDraft));
  }

  async loadDraft(): Promise<OnboardingDraft | null> {
    const rawDraft = this.storage.getItem(this.storageKey);
    if (rawDraft === null) return null;

    let decodedDraft: unknown;
    try {
      decodedDraft = JSON.parse(rawDraft);
    } catch {
      this.storage.removeItem(this.storageKey);
      return null;
    }

    const parsedDraft = onboardingDraftSchema.safeParse(decodedDraft);
    if (
      !parsedDraft.success ||
      !targetsMatch(calculateNutritionTargets(parsedDraft.data.inputs), parsedDraft.data.targets)
    ) {
      this.storage.removeItem(this.storageKey);
      return null;
    }

    return parsedDraft.data;
  }

  async clearDraft(): Promise<void> {
    this.storage.removeItem(this.storageKey);
  }
}
