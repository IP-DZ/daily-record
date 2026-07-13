import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterEach(() => {
  cleanup();
  if (localStorageDescriptor !== undefined) {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor);
  }
});

describe('App', () => {
  it('renders the onboarding entry in Chinese', () => {
    render(<App />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: '每日记录' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始设置' })).toHaveAttribute('href', '/onboarding');
  });

  it('renders the real onboarding form at /onboarding', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '计算增肌目标' })).toBeInTheDocument();
  });

  it('keeps the today route available', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '今日记录' })).toBeInTheDocument();
  });

  it('shows a recoverable notice when browser storage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage unavailable');
      },
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/本地存储暂不可用.*仍可填写和预览/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '计算增肌目标' })).toBeInTheDocument();
  });
});
