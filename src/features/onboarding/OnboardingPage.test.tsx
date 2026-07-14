import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NutritionInputs, NutritionTargets } from '../../domain/nutrition';
import type { OnboardingDraft, SettingsRepository } from '../../platform/settings';
import type { ProfileSettingsRepository } from '../../platform/settings/ProfileSettingsRepository';
import { OnboardingPage } from './OnboardingPage';

afterEach(cleanup);

function createMemorySettingsRepository(initialDraft: OnboardingDraft | null = null) {
  let draft = initialDraft;

  const repository: SettingsRepository = {
    async saveDraft(nextDraft) {
      draft = { ...nextDraft, savedAt: '2026-07-13T00:00:00.000Z' };
    },
    async loadDraft() {
      return draft;
    },
    async clearDraft() {
      draft = null;
    },
  };

  return repository;
}

async function fillRequiredInputs() {
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByLabelText('年龄')).toBeEnabled());
  await user.type(screen.getByLabelText('年龄'), '30');
  await user.selectOptions(screen.getByLabelText('生理性别'), 'male');
  await user.type(screen.getByLabelText('身高（厘米）'), '175');
  await user.type(screen.getByLabelText('体重（千克）'), '70');
  await user.selectOptions(screen.getByLabelText('日常活动量'), 'moderate');
  await user.clear(screen.getByLabelText('每周训练天数'));
  await user.type(screen.getByLabelText('每周训练天数'), '3');
  await user.selectOptions(screen.getByLabelText('训练经验'), 'intermediate');
  return user;
}

async function waitForFormReady() {
  await waitFor(() => expect(screen.getByLabelText('年龄')).toBeEnabled());
}

describe('OnboardingPage', () => {
  it('keeps the current-user local draft and does not load remote settings', async () => {
    const local = createMemorySettingsRepository({
      inputs: {
        age: 31, sex: 'female', heightCm: 165, weightKg: 60, activityLevel: 'light',
        proteinGramsPerKg: 1.6, fatCalorieRatio: 0.25, surplusRatio: 0.1,
      },
      trainingDaysPerWeek: 2,
      trainingExperience: 'beginner',
      targets: {
        restingKcal: 1320.25, maintenanceKcal: 1815.34375, caloriesKcal: 1996.878125,
        proteinGrams: 96, fatGrams: 55.4688368056, carbsGrams: 278.415201389,
      },
      savedAt: '2026-07-13T00:00:00.000Z',
    });
    const remote: ProfileSettingsRepository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(<OnboardingPage repository={local} profileSettings={remote} />);

    expect(await screen.findByDisplayValue('31')).toBeInTheDocument();
    expect(remote.load).not.toHaveBeenCalled();
  });

  it('loads remote settings only when the current-user local draft is empty', async () => {
    const remoteDraft = {
      inputs: {
        age: 32, sex: 'male' as const, heightCm: 180, weightKg: 80, activityLevel: 'high' as const,
        proteinGramsPerKg: 2, fatCalorieRatio: 0.25, surplusRatio: 0.1,
      },
      trainingDaysPerWeek: 5,
      trainingExperience: 'advanced' as const,
      targets: {
        restingKcal: 1790, maintenanceKcal: 3087.75, caloriesKcal: 3396.525,
        proteinGrams: 160, fatGrams: 94.3479166667, carbsGrams: 476.3484375,
      },
    };
    const local = createMemorySettingsRepository();
    const remote: ProfileSettingsRepository = {
      load: vi.fn().mockResolvedValue(remoteDraft),
      save: vi.fn().mockResolvedValue(undefined),
    };

    render(<OnboardingPage repository={local} profileSettings={remote} />);

    expect(await screen.findByDisplayValue('32')).toBeInTheDocument();
    expect(screen.getByLabelText('每周训练天数')).toHaveValue(5);
    expect(remote.load).toHaveBeenCalledTimes(1);
  });

  it('saves the current-user local draft before starting remote sync', async () => {
    const order: string[] = [];
    const local = createMemorySettingsRepository();
    local.saveDraft = vi.fn(async () => { order.push('local'); });
    const remote: ProfileSettingsRepository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(async () => { order.push('remote'); }),
    };
    render(<OnboardingPage repository={local} profileSettings={remote} />);
    const user = await fillRequiredInputs();

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('已保存到此设备并同步到云端。')).toBeInTheDocument();
    expect(order).toEqual(['local', 'remote']);
  });

  it('keeps the form and local draft when remote sync fails and permits retry', async () => {
    const local = createMemorySettingsRepository();
    const remote: ProfileSettingsRepository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockRejectedValueOnce(new Error('private provider detail')).mockResolvedValueOnce(undefined),
    };
    render(<OnboardingPage repository={local} profileSettings={remote} />);
    const user = await fillRequiredInputs();

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('云端同步失败，可重试。')).toBeInTheDocument();
    expect(screen.getByText('2811 千卡')).toBeInTheDocument();
    expect((await local.loadDraft())?.inputs.weightKg).toBe(70);
    expect(document.body.textContent).not.toContain('private provider detail');

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));
    expect(await screen.findByText('已保存到此设备并同步到云端。')).toBeInTheDocument();
    expect(remote.save).toHaveBeenCalledTimes(2);
  });

  it('provides editable safe defaults for training context', async () => {
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);

    await waitFor(() => expect(screen.getByLabelText('每周训练天数')).toBeEnabled());
    expect(screen.getByLabelText('每周训练天数')).toHaveValue(3);
    expect(screen.getByLabelText('训练经验')).toHaveValue('beginner');
  });

  it('calculates and saves editable muscle-gain targets', async () => {
    const user = userEvent.setup();
    const repository = createMemorySettingsRepository();
    render(<OnboardingPage repository={repository} />);
    await waitForFormReady();

    await user.type(screen.getByLabelText('年龄'), '30');
    await user.selectOptions(screen.getByLabelText('生理性别'), 'male');
    await user.type(screen.getByLabelText('身高（厘米）'), '175');
    await user.type(screen.getByLabelText('体重（千克）'), '70');
    await user.selectOptions(screen.getByLabelText('日常活动量'), 'moderate');
    await user.clear(screen.getByLabelText('每周训练天数'));
    await user.type(screen.getByLabelText('每周训练天数'), '3');
    await user.selectOptions(screen.getByLabelText('训练经验'), 'intermediate');
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('2811 千卡')).toBeInTheDocument();
    expect(screen.getByText(/估算值，不构成医疗建议/)).toBeInTheDocument();
    const savedDraft = await repository.loadDraft();
    expect(savedDraft).not.toBeNull();
    expect(savedDraft?.targets.caloriesKcal).toBeCloseTo(2811.11875, 5);
    expect(savedDraft?.trainingDaysPerWeek).toBe(3);
    expect(savedDraft?.trainingExperience).toBe('intermediate');
  });

  it('shows an age error linked to the age input for people under 18', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);
    await waitForFormReady();

    await user.type(screen.getByLabelText('年龄'), '17');
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    const error = await screen.findByText('年龄需在 18 到 100 岁之间');
    expect(screen.getByLabelText('年龄')).toHaveAttribute('aria-describedby', error.id);
  });

  it('prompts the user to use manual targets when biological sex is not selected', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);
    await waitForFormReady();

    await user.type(screen.getByLabelText('年龄'), '30');
    await user.type(screen.getByLabelText('身高（厘米）'), '175');
    await user.type(screen.getByLabelText('体重（千克）'), '70');
    await user.selectOptions(screen.getByLabelText('日常活动量'), 'moderate');
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText(/请选择生理性别，或改用手动设置/)).toBeInTheDocument();
  });

  it('recalculates after the user changes the protein target', async () => {
    const repository = createMemorySettingsRepository();
    render(<OnboardingPage repository={repository} />);
    const user = await fillRequiredInputs();

    const proteinInput = screen.getByLabelText('蛋白质（克/千克）');
    await user.clear(proteinInput);
    await user.type(proteinInput, '2');
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('140 克')).toBeInTheDocument();
    expect((await repository.loadDraft())?.inputs.proteinGramsPerKg).toBe(2);
  });

  it('clears a calculated preview and saved-success message when a calculation input changes', async () => {
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);
    const user = await fillRequiredInputs();
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('2811 千卡')).toBeInTheDocument();
    expect(screen.getByText('草稿已保存在此设备。')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('体重（千克）'));
    await user.type(screen.getByLabelText('体重（千克）'), '71');

    expect(screen.queryByText('2811 千卡')).not.toBeInTheDocument();
    expect(screen.queryByText('草稿已保存在此设备。')).not.toBeInTheDocument();
  });

  it('does not restore a saved-success message when an obsolete save finishes after editing', async () => {
    let finishSave!: () => void;
    const repository: SettingsRepository = {
      async loadDraft() {
        return null;
      },
      saveDraft: () => new Promise<void>((resolve) => { finishSave = resolve; }),
      async clearDraft() {},
    };
    render(<OnboardingPage repository={repository} />);
    const user = await fillRequiredInputs();
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));
    expect(await screen.findByText('2811 千卡')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('体重（千克）'));
    await user.type(screen.getByLabelText('体重（千克）'), '71');
    await act(async () => {
      finishSave();
    });

    expect(screen.queryByText('草稿已保存在此设备。')).not.toBeInTheDocument();
  });

  it('serializes saves and requires an explicit submit for edited values after the pending save', async () => {
    const savedWeights: number[] = [];
    const finishSaves: Array<() => void> = [];
    const repository: SettingsRepository = {
      async loadDraft() {
        return null;
      },
      saveDraft: (draft) => {
        savedWeights.push(draft.inputs.weightKg);
        return new Promise<void>((resolve) => {
          finishSaves.push(resolve);
        });
      },
      async clearDraft() {},
    };
    render(<OnboardingPage repository={repository} />);
    const user = await fillRequiredInputs();

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));
    expect(await screen.findByText('2811 千卡')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('体重（千克）'));
    await user.type(screen.getByLabelText('体重（千克）'), '71');
    await user.click(screen.getByRole('button', { name: '正在保存…' }));

    expect(savedWeights).toEqual([70]);
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled();

    await act(async () => {
      finishSaves[0]();
    });
    expect(screen.queryByText('草稿已保存在此设备。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));
    expect(savedWeights).toEqual([70, 71]);
    expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled();

    await act(async () => {
      finishSaves[1]();
    });
    expect(screen.getByText('草稿已保存在此设备。')).toBeInTheDocument();
  });

  it('disables the form until an asynchronous draft restore finishes', async () => {
    let resolveDraft!: (draft: OnboardingDraft | null) => void;
    const repository: SettingsRepository = {
      loadDraft: () => new Promise((resolve) => { resolveDraft = resolve; }),
      async saveDraft() {},
      async clearDraft() {},
    };
    render(<OnboardingPage repository={repository} />);

    expect(screen.getByText('正在恢复草稿…')).toBeInTheDocument();
    expect(screen.getByLabelText('年龄')).toBeDisabled();
    expect(screen.getByRole('button', { name: '计算增肌目标' })).toBeDisabled();

    resolveDraft(null);

    await waitFor(() => expect(screen.getByLabelText('年龄')).toBeEnabled());
  });

  it('restores saved inputs and targets when the page loads', async () => {
    const inputs: NutritionInputs = {
      age: 30,
      sex: 'male',
      heightCm: 175,
      weightKg: 70,
      activityLevel: 'moderate',
      proteinGramsPerKg: 1.6,
      fatCalorieRatio: 0.25,
      surplusRatio: 0.1,
    };
    const targets: NutritionTargets = {
      restingKcal: 1648.75,
      maintenanceKcal: 2555.5625,
      caloriesKcal: 2811.11875,
      proteinGrams: 112,
      fatGrams: 78.0866319444,
      carbsGrams: 415.084765625,
    };
    const repository = createMemorySettingsRepository({
      inputs,
      targets,
      trainingDaysPerWeek: 4,
      trainingExperience: 'advanced',
      savedAt: '2026-07-13T00:00:00.000Z',
    });

    render(<OnboardingPage repository={repository} />);

    expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByText('2811 千卡')).toBeInTheDocument();
    expect(screen.getByLabelText('每周训练天数')).toHaveValue(4);
    expect(screen.getByLabelText('训练经验')).toHaveValue('advanced');
  });

  it('shows a recoverable message when loading the draft fails', async () => {
    const repository: SettingsRepository = {
      async loadDraft() {
        throw new Error('load failed');
      },
      async saveDraft() {},
      async clearDraft() {},
    };

    render(<OnboardingPage repository={repository} />);

    expect(await screen.findByText(/暂时无法恢复草稿.*仍可重新填写/)).toBeInTheDocument();
  });

  it('keeps the calculated preview and shows a recoverable message when saving fails', async () => {
    const repository: SettingsRepository = {
      async loadDraft() {
        return null;
      },
      async saveDraft() {
        throw new Error('save failed');
      },
      async clearDraft() {},
    };
    render(<OnboardingPage repository={repository} />);
    const user = await fillRequiredInputs();

    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByText('2811 千卡')).toBeInTheDocument();
    expect(screen.getByText(/目标已计算，但草稿暂时无法保存.*可以重试/)).toBeInTheDocument();
  });

  it('shows form-level validation issues that have no field path', async () => {
    const repository = createMemorySettingsRepository();
    render(<OnboardingPage repository={repository} />);
    const user = userEvent.setup();
    await waitForFormReady();

    await user.type(screen.getByLabelText('年龄'), '100');
    await user.selectOptions(screen.getByLabelText('生理性别'), 'female');
    await user.type(screen.getByLabelText('身高（厘米）'), '100');
    await user.type(screen.getByLabelText('体重（千克）'), '350');
    await user.selectOptions(screen.getByLabelText('日常活动量'), 'sedentary');
    await user.clear(screen.getByLabelText('蛋白质（克/千克）'));
    await user.type(screen.getByLabelText('蛋白质（克/千克）'), '2.2');
    await user.clear(screen.getByLabelText('脂肪热量占比'));
    await user.type(screen.getByLabelText('脂肪热量占比'), '0.4');
    await user.clear(screen.getByLabelText('热量盈余比例'));
    await user.type(screen.getByLabelText('热量盈余比例'), '0');
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('碳水目标不能为负数');
  });

  it('reveals manual setup guidance from an operable entry', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);

    await user.click(screen.getByRole('button', { name: '改用手动设置' }));

    expect(screen.getByText(/手动目标将在后续步骤中设置/)).toBeInTheDocument();
  });

  it('does not turn an empty decimal input into zero', async () => {
    render(<OnboardingPage repository={createMemorySettingsRepository()} />);
    const user = await fillRequiredInputs();

    await user.clear(screen.getByLabelText('脂肪热量占比'));
    await user.click(screen.getByRole('button', { name: '计算增肌目标' }));

    await waitFor(() => {
      expect(screen.getByLabelText('脂肪热量占比')).toHaveValue(null);
    });
    expect(screen.queryByText('2811 千卡')).not.toBeInTheDocument();
  });
});
