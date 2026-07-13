import type { OnboardingDraft, OnboardingDraftInput } from './onboardingTypes';

export interface SettingsRepository {
  saveDraft(draft: OnboardingDraftInput): Promise<void>;
  loadDraft(): Promise<OnboardingDraft | null>;
  clearDraft(): Promise<void>;
}
