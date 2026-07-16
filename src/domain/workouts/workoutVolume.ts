import type { WorkoutSession } from '@daily-record/contracts';

export function calculateWorkoutVolume(session: Pick<WorkoutSession, 'exercises'>): number {
  return session.exercises.reduce((sessionVolume, exercise) => (
    sessionVolume + exercise.sets.reduce((exerciseVolume, set) => {
      if (!set.completed) return exerciseVolume;
      return exerciseVolume + (set.weightKg * set.reps);
    }, 0)
  ), 0);
}
