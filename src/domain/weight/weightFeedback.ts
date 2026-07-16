import type { WeightEntry } from '@daily-record/contracts';

export interface WeightFeedback {
  status: 'insufficient-data' | 'increase-calories' | 'decrease-calories' | 'maintain';
  deltaCaloriesKcal: -100 | 0 | 100;
  weeklyChangeKg: number | null;
  targetWeeklyGainKg: number;
}

const targetGainRatioPerWeek = 0.0025;

function dateToUtcDay(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) / 86_400_000;
}

function averageWeight(entries: readonly WeightEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.weightKg, 0) / entries.length;
}

export function calculateWeightFeedback(
  entries: readonly WeightEntry[],
  currentWeightKg: number,
): WeightFeedback {
  const targetWeeklyGainKg = Number((currentWeightKg * targetGainRatioPerWeek).toFixed(6));
  const sorted = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  if (sorted.length < 8) {
    return {
      status: 'insufficient-data',
      deltaCaloriesKcal: 0,
      weeklyChangeKg: null,
      targetWeeklyGainKg,
    };
  }

  const firstDate = dateToUtcDay(sorted[0].entryDate);
  const lastDate = dateToUtcDay(sorted[sorted.length - 1].entryDate);
  const spanDays = lastDate - firstDate;
  if (spanDays < 21) {
    return {
      status: 'insufficient-data',
      deltaCaloriesKcal: 0,
      weeklyChangeKg: null,
      targetWeeklyGainKg,
    };
  }

  const firstWindowAverage = averageWeight(sorted.slice(0, 7));
  const lastWindowAverage = averageWeight(sorted.slice(-7));
  const weeklyChangeKg = ((lastWindowAverage - firstWindowAverage) / spanDays) * 7;

  if (weeklyChangeKg < targetWeeklyGainKg * 0.5) {
    return {
      status: 'increase-calories',
      deltaCaloriesKcal: 100,
      weeklyChangeKg,
      targetWeeklyGainKg,
    };
  }

  if (weeklyChangeKg > targetWeeklyGainKg * 1.5) {
    return {
      status: 'decrease-calories',
      deltaCaloriesKcal: -100,
      weeklyChangeKg,
      targetWeeklyGainKg,
    };
  }

  return {
    status: 'maintain',
    deltaCaloriesKcal: 0,
    weeklyChangeKg,
    targetWeeklyGainKg,
  };
}
