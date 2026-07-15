import type { WeightEntry, WorkoutSession } from '@daily-record/contracts';

export interface WeightTrendPoint {
  date: string;
  weightKg: number;
  sevenDayAverageKg: number | null;
}

export interface WorkoutWeekTrendPoint {
  weekStartDate: string;
  weekEndDate: string;
  sessionCount: number;
  volumeKg: number;
  topSetWeightKg: number | null;
}

interface BuildWorkoutWeekTrendInput {
  startDate: string;
  endDate: string;
  workouts: readonly WorkoutSession[];
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTrendNumber(value: number): number {
  return Number(value.toFixed(2));
}

export function buildWeightTrend(entries: readonly WeightEntry[]): WeightTrendPoint[] {
  const sorted = [...entries].sort((left, right) => (
    left.entryDate.localeCompare(right.entryDate) || left.id.localeCompare(right.id)
  ));

  return sorted.map((entry, index) => {
    const window = sorted.slice(Math.max(0, index - 6), index + 1);
    return {
      date: entry.entryDate,
      weightKg: entry.weightKg,
      sevenDayAverageKg: window.length < 7
        ? null
        : roundTrendNumber(average(window.map((point) => point.weightKg))),
    };
  });
}

function topCompletedSetWeight(workout: WorkoutSession): number | null {
  const completedWeights = workout.exercises.flatMap((exercise) => (
    exercise.sets
      .filter((set) => set.completed)
      .map((set) => set.weightKg)
  ));
  if (completedWeights.length === 0) return null;
  return Math.max(...completedWeights);
}

export function buildWorkoutWeekTrend({
  startDate,
  endDate,
  workouts,
}: BuildWorkoutWeekTrendInput): WorkoutWeekTrendPoint[] {
  if (workouts.length === 0) return [];

  const sorted = [...workouts].sort((left, right) => (
    left.workoutDate.localeCompare(right.workoutDate) || left.id.localeCompare(right.id)
  ));
  const weeks: WorkoutWeekTrendPoint[] = [];

  for (let weekStartDate = startDate; weekStartDate <= endDate; weekStartDate = addDays(weekStartDate, 7)) {
    const weekEndDate = addDays(weekStartDate, 6) <= endDate ? addDays(weekStartDate, 6) : endDate;
    const sessions = sorted.filter((workout) => (
      workout.workoutDate >= weekStartDate && workout.workoutDate <= weekEndDate
    ));
    if (sessions.length === 0) continue;

    const completedWeights = sessions
      .map(topCompletedSetWeight)
      .filter((weight): weight is number => weight !== null);

    weeks.push({
      weekStartDate,
      weekEndDate,
      sessionCount: sessions.length,
      volumeKg: sessions.reduce((sum, workout) => sum + workout.volumeKg, 0),
      topSetWeightKg: completedWeights.length === 0 ? null : Math.max(...completedWeights),
    });
  }

  return weeks;
}
