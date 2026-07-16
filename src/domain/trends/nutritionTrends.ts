import type {
  MealNutritionTotals,
  NutritionGoalVersion,
  NutritionTargets,
} from '@daily-record/contracts';

type Completion = {
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

export interface DailyNutritionTrendPoint {
  date: string;
  consumed: MealNutritionTotals;
  target: NutritionTargets | null;
  completion: Completion;
}

export interface WeeklyNutritionTrendPoint {
  weekStartDate: string;
  weekEndDate: string;
  dayCount: number;
  consumed: MealNutritionTotals;
  target: MealNutritionTotals | null;
  completion: Completion;
}

export interface BuildDailyNutritionTrendInput {
  startDate: string;
  endDate: string;
  mealsByDate: Readonly<Record<string, MealNutritionTotals>>;
  goalVersions: readonly NutritionGoalVersion[];
}

const zeroTotals: MealNutritionTotals = {
  caloriesKcal: 0,
  proteinGrams: 0,
  fatGrams: 0,
  carbsGrams: 0,
};

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function compareGoalVersions(left: NutritionGoalVersion, right: NutritionGoalVersion): number {
  return (
    left.effectiveDate.localeCompare(right.effectiveDate)
    || left.version - right.version
    || left.createdAt.localeCompare(right.createdAt)
  );
}

function divideOrNull(consumed: number, target: number | null): number | null {
  return target === null || target <= 0 ? null : consumed / target;
}

function completion(consumed: MealNutritionTotals, target: MealNutritionTotals | NutritionTargets | null): Completion {
  return {
    calories: divideOrNull(consumed.caloriesKcal, target?.caloriesKcal ?? null),
    protein: divideOrNull(consumed.proteinGrams, target?.proteinGrams ?? null),
    fat: divideOrNull(consumed.fatGrams, target?.fatGrams ?? null),
    carbs: divideOrNull(consumed.carbsGrams, target?.carbsGrams ?? null),
  };
}

function addTotals(left: MealNutritionTotals, right: MealNutritionTotals): MealNutritionTotals {
  return {
    caloriesKcal: left.caloriesKcal + right.caloriesKcal,
    proteinGrams: left.proteinGrams + right.proteinGrams,
    fatGrams: left.fatGrams + right.fatGrams,
    carbsGrams: left.carbsGrams + right.carbsGrams,
  };
}

function targetToTotals(target: NutritionTargets): MealNutritionTotals {
  return {
    caloriesKcal: target.caloriesKcal,
    proteinGrams: target.proteinGrams,
    fatGrams: target.fatGrams,
    carbsGrams: target.carbsGrams,
  };
}

export function selectGoalForDate(
  goalVersions: readonly NutritionGoalVersion[],
  date: string,
): NutritionTargets | null {
  const selected = goalVersions
    .filter((goal) => goal.effectiveDate <= date)
    .sort(compareGoalVersions)
    .at(-1);
  return selected?.targets ?? null;
}

export function buildDailyNutritionTrend({
  startDate,
  endDate,
  mealsByDate,
  goalVersions,
}: BuildDailyNutritionTrendInput): DailyNutritionTrendPoint[] {
  const points: DailyNutritionTrendPoint[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const consumed = mealsByDate[date] ?? zeroTotals;
    const target = selectGoalForDate(goalVersions, date);
    points.push({
      date,
      consumed,
      target,
      completion: completion(consumed, target),
    });
  }
  return points;
}

export function buildWeeklyNutritionTrend(
  dailyPoints: readonly DailyNutritionTrendPoint[],
): WeeklyNutritionTrendPoint[] {
  const weeks: WeeklyNutritionTrendPoint[] = [];
  for (let index = 0; index < dailyPoints.length; index += 7) {
    const days = dailyPoints.slice(index, index + 7);
    const consumed = days.reduce((totals, day) => addTotals(totals, day.consumed), zeroTotals);
    const target = days.reduce<MealNutritionTotals | null>((totals, day) => {
      if (day.target === null) return totals;
      const dailyTarget = targetToTotals(day.target);
      return totals === null ? dailyTarget : addTotals(totals, dailyTarget);
    }, null);
    weeks.push({
      weekStartDate: days[0].date,
      weekEndDate: days[days.length - 1].date,
      dayCount: days.length,
      consumed,
      target,
      completion: completion(consumed, target),
    });
  }
  return weeks;
}
