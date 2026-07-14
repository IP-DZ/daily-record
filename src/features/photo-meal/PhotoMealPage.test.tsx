import type {
  ConfirmPhotoMealAnalysisInput,
  MealEntry,
  PhotoMealAnalysis,
  PhotoMealCandidate,
  PreparedMealPhoto,
} from '@daily-record/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { PhotoMealAnalysisRepository } from '../../platform/photoMeal';
import { PhotoMealPage } from './PhotoMealPage';

const mealDate = '2026-07-14';
const photo: PreparedMealPhoto = {
  dataUrl: 'data:image/webp;base64,AAAA',
  mimeType: 'image/webp',
  sizeBytes: 120_000,
  width: 1200,
  height: 900,
  originalName: 'lunch.webp',
};
const candidate: PhotoMealCandidate = {
  id: 'candidate-1',
  name: '番茄炒蛋盖饭',
  estimatedGrams: 320,
  cookingMethod: '炒',
  nutrition: {
    caloriesKcal: 520,
    proteinGrams: 28,
    fatGrams: 18,
    carbsGrams: 62,
  },
  confidence: 0.62,
  questions: ['米饭大约是一碗吗？'],
};
const analysis: PhotoMealAnalysis = {
  id: 'analysis-1',
  mealDate,
  requestId: 'request-1',
  status: 'needs-confirmation',
  candidates: [candidate],
  overallConfidence: 0.62,
  questions: ['请确认米饭分量。'],
  imageObjectKey: 'users/user-a/photo-meal/request-1/photo.webp',
  errorCode: null,
  createdAt: '2026-07-14T12:00:00.000Z',
  updatedAt: '2026-07-14T12:00:00.000Z',
};
const meal: MealEntry = {
  id: 'meal-1',
  mealDate,
  name: '番茄炒蛋盖饭',
  amount: '320克，炒',
  nutrition: candidate.nutrition,
  createdAt: '2026-07-14T12:01:00.000Z',
  updatedAt: '2026-07-14T12:01:00.000Z',
};

function createRepository(overrides: Partial<PhotoMealAnalysisRepository> = {}): PhotoMealAnalysisRepository {
  return {
    create: vi.fn().mockResolvedValue(analysis),
    get: vi.fn().mockResolvedValue(analysis),
    confirm: vi.fn().mockResolvedValue([meal]),
    discard: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(cleanup);

describe('PhotoMealPage', () => {
  it('analyzes an uploaded meal photo and keeps the estimate editable before confirmation', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const preparePhoto = vi.fn().mockResolvedValue(photo);
    render(
      <MemoryRouter>
        <PhotoMealPage photoMeals={repository} preparePhoto={preparePhoto} initialDate={mealDate} />
      </MemoryRouter>,
    );

    expect(screen.getByText('照片会发送给第三方视觉模型处理')).toBeInTheDocument();
    expect(screen.getByText('结果是可编辑估算，不构成医疗建议')).toBeInTheDocument();
    expect(screen.getByText('确认前不会计入今日汇总')).toBeInTheDocument();

    const file = new File(['fake'], 'lunch.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('选择餐食照片'), file);

    expect(await screen.findByRole('heading', { name: 'AI 估算结果' })).toBeInTheDocument();
    expect(screen.getByText('请确认米饭分量。')).toBeInTheDocument();
    expect(screen.getByText('米饭大约是一碗吗？')).toBeInTheDocument();
    expect(repository.confirm).not.toHaveBeenCalled();
    expect(preparePhoto).toHaveBeenCalledWith(file);
    expect(repository.create).toHaveBeenCalledWith({
      mealDate,
      requestId: expect.stringMatching(/^photo-meal-/),
      photo,
    });

    await user.clear(screen.getByLabelText('食物名称 1'));
    await user.type(screen.getByLabelText('食物名称 1'), '番茄炒蛋饭加鸡胸');
    await user.clear(screen.getByLabelText('热量 1'));
    await user.type(screen.getByLabelText('热量 1'), '650');
    await user.click(screen.getByRole('button', { name: '确认并计入今日饮食' }));

    expect(repository.confirm).toHaveBeenCalledWith({
      analysisId: 'analysis-1',
      mealDate,
      items: [expect.objectContaining({
        name: '番茄炒蛋饭加鸡胸',
        nutrition: expect.objectContaining({ caloriesKcal: 650 }),
      })],
    } satisfies ConfirmPhotoMealAnalysisInput);
    expect(await screen.findByText('已生成 1 条正式餐食记录。')).toBeInTheDocument();
  });

  it('allows removing an uncertain candidate before confirmation', async () => {
    const user = userEvent.setup();
    const secondCandidate = { ...candidate, id: 'candidate-2', name: '紫菜蛋花汤', confidence: 0.88 };
    const repository = createRepository({
      create: vi.fn().mockResolvedValue({ ...analysis, candidates: [candidate, secondCandidate] }),
    });
    render(
      <MemoryRouter>
        <PhotoMealPage photoMeals={repository} preparePhoto={vi.fn().mockResolvedValue(photo)} initialDate={mealDate} />
      </MemoryRouter>,
    );

    await user.upload(screen.getByLabelText('选择餐食照片'), new File(['fake'], 'meal.jpg', { type: 'image/jpeg' }));
    const firstCard = await screen.findByRole('article', { name: '番茄炒蛋盖饭' });
    await user.click(within(firstCard).getByRole('button', { name: '删除番茄炒蛋盖饭' }));
    await user.click(screen.getByRole('button', { name: '确认并计入今日饮食' }));

    expect(repository.confirm).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ name: '紫菜蛋花汤' })],
    }));
  });

  it('shows a safe recoverable error when analysis fails', async () => {
    const user = userEvent.setup();
    const repository = createRepository({
      create: vi.fn().mockRejectedValue(new Error('private provider stack trace')),
    });
    render(
      <MemoryRouter>
        <PhotoMealPage photoMeals={repository} preparePhoto={vi.fn().mockResolvedValue(photo)} initialDate={mealDate} />
      </MemoryRouter>,
    );

    await user.upload(screen.getByLabelText('选择餐食照片'), new File(['fake'], 'meal.jpg', { type: 'image/jpeg' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('照片分析失败，可以改用手动记录。');
    expect(document.body.textContent).not.toContain('private provider stack trace');
    expect(screen.getByRole('link', { name: '转手动录入' })).toHaveAttribute('href', '/today');
  });
});
