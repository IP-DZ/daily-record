import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PhotoMealCandidate, PreparedMealPhoto } from '@daily-record/contracts';

import { prepareMealPhoto } from '../../platform/image';
import type { PhotoMealAnalysisRepository } from '../../platform/photoMeal';
import './photoMeal.css';

type PhotoMealPageProps = {
  photoMeals: PhotoMealAnalysisRepository;
  initialDate?: string;
  preparePhoto?: (file: File) => Promise<PreparedMealPhoto>;
};

type CandidateDraft = PhotoMealCandidate;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function requestId() {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Date.now());
  return `photo-meal-${random}`;
}

function numberValue(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function updateCandidate(
  candidates: CandidateDraft[],
  index: number,
  updater: (candidate: CandidateDraft) => CandidateDraft,
) {
  return candidates.map((candidate, candidateIndex) => (
    candidateIndex === index ? updater(candidate) : candidate
  ));
}

export function PhotoMealPage({
  photoMeals,
  initialDate = localDateString(),
  preparePhoto = prepareMealPhoto,
}: PhotoMealPageProps) {
  const [mealDate, setMealDate] = useState(initialDate);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [analysisQuestions, setAnalysisQuestions] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function analyze(file: File) {
    setIsAnalyzing(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setAnalysisId(null);
    setCandidates([]);
    setAnalysisQuestions([]);
    try {
      const photo = await preparePhoto(file);
      const analysis = await photoMeals.create({
        mealDate,
        requestId: requestId(),
        photo,
      });
      setAnalysisId(analysis.id);
      setCandidates(analysis.candidates);
      setAnalysisQuestions([
        ...analysis.questions,
        ...analysis.candidates.flatMap((candidate) => candidate.questions),
      ]);
      if (analysis.status === 'failed') {
        setErrorMessage('照片分析失败，可以改用手动记录。');
      } else {
        setStatusMessage('照片分析完成，请确认后再计入今日汇总。');
      }
    } catch {
      setErrorMessage('照片分析失败，可以改用手动记录。');
    } finally {
      setIsAnalyzing(false);
    }
  }

  function updateText(index: number, field: 'name' | 'cookingMethod', value: string) {
    setCandidates((current) => updateCandidate(current, index, (candidate) => ({
      ...candidate,
      [field]: value,
    })));
  }

  function updateNumber(
    index: number,
    field: 'estimatedGrams' | 'caloriesKcal' | 'proteinGrams' | 'fatGrams' | 'carbsGrams',
    value: string,
  ) {
    const parsed = numberValue(value);
    setCandidates((current) => updateCandidate(current, index, (candidate) => {
      if (field === 'estimatedGrams') {
        return { ...candidate, estimatedGrams: parsed };
      }
      return {
        ...candidate,
        nutrition: {
          ...candidate.nutrition,
          [field]: parsed,
        },
      };
    }));
  }

  function removeCandidate(index: number) {
    setCandidates((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
  }

  function addCandidate() {
    setCandidates((current) => [
      ...current,
      {
        id: `manual-${current.length + 1}`,
        name: '',
        estimatedGrams: 0,
        cookingMethod: '',
        nutrition: {
          caloriesKcal: 0,
          proteinGrams: 0,
          fatGrams: 0,
          carbsGrams: 0,
        },
        confidence: 1,
        questions: [],
      },
    ]);
  }

  async function confirm() {
    if (analysisId === null || candidates.length === 0 || isConfirming) return;
    setIsConfirming(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const meals = await photoMeals.confirm({
        analysisId,
        mealDate,
        items: candidates.map((candidate) => ({
          ...candidate,
          name: candidate.name.trim(),
          cookingMethod: candidate.cookingMethod.trim(),
        })),
      });
      setStatusMessage(`已生成 ${meals.length} 条正式餐食记录。`);
    } catch {
      setErrorMessage('确认失败，请检查估算内容后重试。');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <main className="photo-meal-page">
      <header className="photo-meal-header">
        <p className="photo-meal-eyebrow">AI 拍照记餐</p>
        <h1>拍照记录饮食</h1>
        <p>照片会发送给第三方视觉模型处理</p>
        <p>结果是可编辑估算，不构成医疗建议</p>
        <p>确认前不会计入今日汇总</p>
      </header>

      <section className="photo-meal-panel" aria-label="上传照片">
        <label>
          日期
          <input type="date" value={mealDate} onChange={(event) => setMealDate(event.target.value)} />
        </label>
        <label>
          选择餐食照片
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void analyze(file);
            }}
          />
        </label>
        {isAnalyzing && <p role="status">正在分析照片…</p>}
        {statusMessage && <p role="status">{statusMessage}</p>}
        {errorMessage && (
          <p role="alert">
            {errorMessage}
            {' '}
            <Link to="/today">转手动录入</Link>
          </p>
        )}
      </section>

      {analysisId !== null && candidates.length > 0 && (
        <section className="photo-meal-results" aria-label="AI 估算结果">
          <h2>AI 估算结果</h2>
          {analysisQuestions.length > 0 && (
            <div className="photo-meal-questions">
              {analysisQuestions.map((question) => <p key={question}>{question}</p>)}
            </div>
          )}
          <div className="photo-meal-candidates">
            {candidates.map((candidate, index) => (
              <article key={candidate.id} aria-label={candidate.name || `候选 ${index + 1}`}>
                <label>
                  食物名称 {index + 1}
                  <input value={candidate.name} onChange={(event) => updateText(index, 'name', event.target.value)} />
                </label>
                <label>
                  估计克数 {index + 1}
                  <input
                    type="number"
                    min="0"
                    value={Number.isFinite(candidate.estimatedGrams) ? candidate.estimatedGrams : ''}
                    onChange={(event) => updateNumber(index, 'estimatedGrams', event.target.value)}
                  />
                </label>
                <label>
                  烹饪方式 {index + 1}
                  <input
                    value={candidate.cookingMethod}
                    onChange={(event) => updateText(index, 'cookingMethod', event.target.value)}
                  />
                </label>
                <div className="photo-meal-nutrition-grid">
                  <label>
                    热量 {index + 1}
                    <input
                      type="number"
                      min="0"
                      value={Number.isFinite(candidate.nutrition.caloriesKcal) ? candidate.nutrition.caloriesKcal : ''}
                      onChange={(event) => updateNumber(index, 'caloriesKcal', event.target.value)}
                    />
                  </label>
                  <label>
                    蛋白质 {index + 1}
                    <input
                      type="number"
                      min="0"
                      value={Number.isFinite(candidate.nutrition.proteinGrams) ? candidate.nutrition.proteinGrams : ''}
                      onChange={(event) => updateNumber(index, 'proteinGrams', event.target.value)}
                    />
                  </label>
                  <label>
                    脂肪 {index + 1}
                    <input
                      type="number"
                      min="0"
                      value={Number.isFinite(candidate.nutrition.fatGrams) ? candidate.nutrition.fatGrams : ''}
                      onChange={(event) => updateNumber(index, 'fatGrams', event.target.value)}
                    />
                  </label>
                  <label>
                    碳水 {index + 1}
                    <input
                      type="number"
                      min="0"
                      value={Number.isFinite(candidate.nutrition.carbsGrams) ? candidate.nutrition.carbsGrams : ''}
                      onChange={(event) => updateNumber(index, 'carbsGrams', event.target.value)}
                    />
                  </label>
                </div>
                <button type="button" onClick={() => removeCandidate(index)}>
                  删除{candidate.name}
                </button>
              </article>
            ))}
          </div>
          <div className="photo-meal-actions">
            <button type="button" onClick={addCandidate}>新增候选食物</button>
            <button type="button" disabled={isConfirming || candidates.length === 0} onClick={() => void confirm()}>
              确认并计入今日饮食
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
