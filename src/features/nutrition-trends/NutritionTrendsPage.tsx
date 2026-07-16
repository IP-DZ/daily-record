import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  buildDailyNutritionTrend,
  buildWeeklyNutritionTrend,
  type DailyNutritionTrendPoint,
  type WeeklyNutritionTrendPoint,
} from '../../domain/trends';
import type { MealsRepository } from '../../platform/meals';
import type { NutritionGoalsRepository } from '../../platform/nutritionGoals';
import './nutritionTrends.css';

type NutritionTrendsPageProps = {
  meals: MealsRepository;
  nutritionGoals: NutritionGoalsRepository;
  initialEndDate?: string;
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function progressStyle(value: number | null): CSSProperties & { '--progress': string } {
  return { '--progress': Math.min(value ?? 0, 1.2).toString() };
}

function targetCalories(point: DailyNutritionTrendPoint) {
  return point.target === null ? '暂无目标' : `${formatNumber(point.target.caloriesKcal)} kcal`;
}

function weeklyTargetCalories(point: WeeklyNutritionTrendPoint) {
  return point.target === null ? '暂无目标' : `${formatNumber(point.target.caloriesKcal)} kcal`;
}

function dailyCalories(point: DailyNutritionTrendPoint) {
  return point.target === null
    ? `${formatNumber(point.consumed.caloriesKcal)} / 暂无目标`
    : `${formatNumber(point.consumed.caloriesKcal)} / ${formatNumber(point.target.caloriesKcal)} kcal`;
}

function weeklyCalories(point: WeeklyNutritionTrendPoint) {
  return point.target === null
    ? `${formatNumber(point.consumed.caloriesKcal)} / 暂无目标`
    : `${formatNumber(point.consumed.caloriesKcal)} / ${formatNumber(point.target.caloriesKcal)} kcal`;
}

export function NutritionTrendsPage({
  meals,
  nutritionGoals,
  initialEndDate = localDateString(),
}: NutritionTrendsPageProps) {
  const [endDate, setEndDate] = useState(initialEndDate);
  const [rangeDays, setRangeDays] = useState(7);
  const [dailyPoints, setDailyPoints] = useState<DailyNutritionTrendPoint[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState<WeeklyNutritionTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadToken = useRef(0);

  const startDate = useMemo(() => addDays(endDate, -(rangeDays - 1)), [endDate, rangeDays]);

  async function loadRange() {
    const token = ++loadToken.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const goals = await nutritionGoals.listByDateRange(startDate, endDate);
      const entries = await Promise.all(
        Array.from({ length: rangeDays }, async (_unused, index) => {
          const date = addDays(startDate, index);
          const result = await meals.listByDate(date);
          return [date, result.totals] as const;
        }),
      );
      if (loadToken.current !== token) return;
      const points = buildDailyNutritionTrend({
        startDate,
        endDate,
        goalVersions: goals,
        mealsByDate: Object.fromEntries(entries),
      });
      setDailyPoints(points);
      setWeeklyPoints(buildWeeklyNutritionTrend(points));
    } catch {
      if (loadToken.current !== token) return;
      setErrorMessage('暂时无法加载营养趋势，请稍后重试。');
      if (dailyPoints.length === 0) {
        setDailyPoints([]);
        setWeeklyPoints([]);
      }
    } finally {
      if (loadToken.current === token) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRange();
  }, [meals, nutritionGoals, startDate, endDate, rangeDays]);

  return (
    <main className="nutrition-trends-page">
      <header className="nutrition-trends-header">
        <p className="nutrition-trends-eyebrow">趋势</p>
        <h1>营养趋势</h1>
        <p>目标和摄入均为估算，不构成医疗建议。</p>
      </header>

      <section className="nutrition-trends-panel" aria-label="趋势筛选">
        <label>
          结束日期
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <div className="nutrition-trends-range" aria-label="时间范围">
          <button type="button" aria-pressed={rangeDays === 7} onClick={() => setRangeDays(7)}>
            近 7 天
          </button>
          <button type="button" aria-pressed={rangeDays === 28} onClick={() => setRangeDays(28)}>
            近 28 天
          </button>
        </div>
      </section>

      {isLoading && <p role="status" className="nutrition-trends-message">正在加载营养趋势…</p>}
      {errorMessage && (
        <p role="alert" className="nutrition-trends-error">
          {errorMessage}
          {' '}
          <button type="button" onClick={() => void loadRange()}>重试</button>
        </p>
      )}

      <section className="nutrition-trends-table-card" aria-label="每日营养趋势">
        <h2>每日完成情况</h2>
        {dailyPoints.length === 0 && !isLoading ? (
          <p className="nutrition-trends-empty">暂无可展示的营养趋势。</p>
        ) : (
          <div className="nutrition-trends-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">日期</th>
                  <th scope="col">热量</th>
                  <th scope="col">目标</th>
                  <th scope="col">完成率</th>
                </tr>
              </thead>
              <tbody>
                {dailyPoints.map((point) => (
                  <tr key={point.date}>
                    <th scope="row">{point.date}</th>
                    <td>{dailyCalories(point)}</td>
                    <td>{targetCalories(point)}</td>
                    <td>
                      <span>{formatPercent(point.completion.calories)}</span>
                      <span
                        className="nutrition-trends-bar"
                        aria-hidden="true"
                        style={progressStyle(point.completion.calories)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="nutrition-trends-table-card" aria-label="周营养汇总">
        <h2>周汇总</h2>
        <div className="nutrition-trends-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">周期</th>
                <th scope="col">热量</th>
                <th scope="col">目标</th>
                <th scope="col">完成率</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPoints.map((point) => (
                <tr key={`${point.weekStartDate}-${point.weekEndDate}`}>
                  <th scope="row">{point.weekStartDate} 至 {point.weekEndDate}</th>
                  <td>{weeklyCalories(point)}</td>
                  <td>{weeklyTargetCalories(point)}</td>
                  <td>{formatPercent(point.completion.calories)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
