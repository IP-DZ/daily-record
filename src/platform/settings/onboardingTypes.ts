import type { NutritionInputs, NutritionTargets } from '../../domain/nutrition';

export type TrainingExperience = 'beginner' | 'intermediate' | 'advanced';

export interface OnboardingDraft {
  inputs: NutritionInputs;
  trainingDaysPerWeek: number;
  trainingExperience: TrainingExperience;
  targets: NutritionTargets;
  savedAt: string;
}

export type OnboardingDraftInput = Omit<OnboardingDraft, 'savedAt'>;
