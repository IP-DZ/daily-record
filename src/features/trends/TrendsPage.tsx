import { useEffect, useMemo, useRef, useState } from 'react';

import type { MealNutritionTotals } from '@daily-record/contracts';
import {
  buildDailyNutritionTrend,
  buildWeightTrend,
  buildWeeklyNutritionTrend,
  buildWorkoutWeekTrend,
  type WeightTrendPoint,
  type WeeklyNutritionTrendPoint,
  type WorkoutWeekTrendPoint,
} from '../../domain/trends';
import type { MealsRepository } from '../../platform/meals';
import type { NutritionGoalsRepository } from '../../platform/nutritionGoals';
import type { WeightRepository } from '../../platform/weight';
import type { WorkoutsRepository } from '../../platform/workouts';
import './trends.css';

type TrendsSection = 'nutrition' | 'weight' | 'workouts';

type TrendsPageProps = {
  meals: MealsRepository;
  nutritionGoals: NutritionGoalsRepository;
  weight: WeightRepository;
  workouts: WorkoutsRepository;
  initialEndDate?: string;
};

const rangeDays = 28;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatCalories(point: WeeklyNutritionTrendPoint): string {
  return point.target === null
    ? `${formatNumber(point.consumed.caloriesKcal)} / 暂无目标`
    : `${formatNumber(point.consumed.caloriesKcal)} / ${formatNumber(point.target.caloriesKcal)} kcal`;
}

const zeroTotals: MealNutritionTotals = {
  caloriesKcal: 0,
  proteinGrams: 0,
  fatGrams: 0,
  carbsGrams: 0,
};

export function TrendsPage({
  meals,
  nutritionGoals,
  weight,
  workouts,
  initialEndDate = localDateString(),
}: TrendsPageProps) {
  const [endDate, setEndDate] = useState(initialEndDate);
  const [activeSection, setActiveSection] = useState<TrendsSection>('nutrition');
  const [nutritionWeeks, setNutritionWeeks] = useState<WeeklyNutritionTrendPoint[]>([]);
  const [hasNutritionTarget, setHasNutritionTarget] = useState(false);
  const [weightPoints, setWeightPoints] = useState<WeightTrendPoint[]>([]);
  const [workoutWeeks, setWorkoutWeeks] = useState<WorkoutWeekTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadToken = useRef(0);

  const startDate = useMemo(() => addDays(endDate, -(rangeDays - 1)), [endDate]);

  async function loadTrends() {
    const token = ++loadToken.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [goals, weightEntries, workoutEntries, mealEntries] = await Promise.all([
        nutritionGoals.listByDateRange(startDate, endDate),
        weight.listByDateRange(startDate, endDate),
        workouts.listByDateRange(startDate, endDate),
        Promise.all(
          Array.from({ length: rangeDays }, async (_unused, index) => {
            const date = addDays(startDate, index);
            const result = await meals.listByDate(date);
            return [date, result.totals ?? zeroTotals] as const;
          }),
        ),
      ]);
      if (loadToken.current !== token) return;

      const dailyNutrition = buildDailyNutritionTrend({
        startDate,
        endDate,
        goalVersions: goals,
        mealsByDate: Object.fromEntries(mealEntries),
      });
      setNutritionWeeks(buildWeeklyNutritionTrend(dailyNutrition));
      setHasNutritionTarget(dailyNutrition.some((point) => point.target !== null));
      setWeightPoints(buildWeightTrend(weightEntries));
      setWorkoutWeeks(buildWorkoutWeekTrend({ startDate, endDate, workouts: workoutEntries }));
    } catch {
      if (loadToken.current !== token) return;
      setErrorMessage('暂时无法加载综合趋势，请稍后重试。');
    } finally {
      if (loadToken.current === token) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTrends();
  }, [meals, nutritionGoals, weight, workouts, startDate, endDate]);

  const latestWeight = weightPoints.at(-1);

  return (
    <main className="trends-page">
      <header className="trends-header">
        <p className="trends-eyebrow">综合趋势</p>
        <h1>综合趋势</h1>
        <p>趋势和建议均为估算，不构成医疗建议。</p>
      </header>

      <section className="trends-controls" aria-label="趋势筛选">
        <label>
          结束日期
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <div className="trends-tabs" aria-label="趋势类型">
          <button type="button" aria-pressed={activeSection === 'nutrition'} onClick={() => setActiveSection('nutrition')}>
            营养
          </button>
          <button type="button" aria-pressed={activeSection === 'weight'} onClick={() => setActiveSection('weight')}>
            体重
          </button>
          <button type="button" aria-pressed={activeSection === 'workouts'} onClick={() => setActiveSection('workouts')}>
            训练
          </button>
        </div>
      </section>

      {isLoading && <p role="status" className="trends-message">正在加载综合趋势…</p>}
      {errorMessage && (
        <p role="alert" className="trends-error">
          {errorMessage}
          {' '}
          <button type="button" onClick={() => void loadTrends()}>重试</button>
        </p>
      )}

      {activeSection === 'nutrition' && (
        <section className="trends-card" aria-label="营养趋势概览">
          <h2>营养完成</h2>
          {!hasNutritionTarget && !isLoading ? (
            <p className="trends-empty">暂无营养目标。</p>
          ) : (
            <div className="trends-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">周期</th>
                    <th scope="col">热量</th>
                    <th scope="col">完成率</th>
                  </tr>
                </thead>
                <tbody>
                  {nutritionWeeks.map((point) => (
                    <tr key={`${point.weekStartDate}-${point.weekEndDate}`}>
                      <th scope="row">{point.weekStartDate} 至 {point.weekEndDate}</th>
                      <td>{formatCalories(point)}</td>
                      <td>{formatPercent(point.completion.calories)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeSection === 'weight' && (
        <section className="trends-card" aria-label="体重趋势概览">
          <h2>体重趋势</h2>
          {weightPoints.length === 0 && !isLoading ? (
            <p className="trends-empty">还没有足够的体重记录。</p>
          ) : (
            <>
              <div className="trends-metric-grid">
                <div>
                  <p>最新体重</p>
                  <strong>{latestWeight === undefined ? '暂无' : `${formatNumber(latestWeight.weightKg)} kg`}</strong>
                </div>
                <div>
                  <p>7 日均重</p>
                  <strong>{latestWeight?.sevenDayAverageKg === null || latestWeight === undefined
                    ? '数据不足'
                    : `${formatNumber(latestWeight.sevenDayAverageKg)} kg`}</strong>
                </div>
              </div>
              <div className="trends-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">日期</th>
                      <th scope="col">体重</th>
                      <th scope="col">7 日均重</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weightPoints.map((point) => (
                      <tr key={point.date}>
                        <th scope="row">{point.date}</th>
                        <td>{formatNumber(point.weightKg)} kg</td>
                        <td>{point.sevenDayAverageKg === null ? '数据不足' : `${formatNumber(point.sevenDayAverageKg)} kg`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {activeSection === 'workouts' && (
        <section className="trends-card" aria-label="训练趋势概览">
          <h2>训练趋势</h2>
          {workoutWeeks.length === 0 && !isLoading ? (
            <p className="trends-empty">还没有训练记录。</p>
          ) : (
            <div className="trends-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">周期</th>
                    <th scope="col">次数</th>
                    <th scope="col">容量</th>
                    <th scope="col">最高重量</th>
                  </tr>
                </thead>
                <tbody>
                  {workoutWeeks.map((point) => (
                    <tr key={`${point.weekStartDate}-${point.weekEndDate}`}>
                      <th scope="row">{point.weekStartDate} 至 {point.weekEndDate}</th>
                      <td>{point.sessionCount} 次</td>
                      <td>{formatNumber(point.volumeKg)} kg</td>
                      <td>{point.topSetWeightKg === null ? '暂无' : `${formatNumber(point.topSetWeightKg)} kg`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
