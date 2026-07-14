import type {
  CreateMealInput,
  MealNutritionTotals,
  PhotoMealAnalysis,
  PhotoMealCandidate,
} from '@daily-record/contracts';

const lowConfidenceThreshold = 0.7;

function emptyTotals(): MealNutritionTotals {
  return {
    caloriesKcal: 0,
    proteinGrams: 0,
    fatGrams: 0,
    carbsGrams: 0,
  };
}

function formatGrams(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function calculateCandidateTotals(candidates: readonly PhotoMealCandidate[]): MealNutritionTotals {
  return candidates.reduce<MealNutritionTotals>(
    (totals, candidate) => ({
      caloriesKcal: totals.caloriesKcal + candidate.nutrition.caloriesKcal,
      proteinGrams: totals.proteinGrams + candidate.nutrition.proteinGrams,
      fatGrams: totals.fatGrams + candidate.nutrition.fatGrams,
      carbsGrams: totals.carbsGrams + candidate.nutrition.carbsGrams,
    }),
    emptyTotals(),
  );
}

export function analysisNeedsUserInput(analysis: PhotoMealAnalysis): boolean {
  return analysis.overallConfidence < lowConfidenceThreshold
    || analysis.questions.length > 0
    || analysis.candidates.some((candidate) => (
      candidate.confidence < lowConfidenceThreshold
      || candidate.questions.length > 0
    ));
}

export function candidateToMealInput(
  candidate: PhotoMealCandidate,
  mealDate: string,
): CreateMealInput {
  const grams = `${formatGrams(candidate.estimatedGrams)}克`;
  const cookingMethod = candidate.cookingMethod.trim();
  return {
    mealDate,
    name: candidate.name,
    amount: cookingMethod === '' ? grams : `${grams}，${cookingMethod}`,
    nutrition: candidate.nutrition,
  };
}
