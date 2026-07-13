import { describe, expect, it } from 'vitest';

import { safeLocalStorage } from './safeLocalStorage';

describe('safeLocalStorage', () => {
  it('returns the available browser storage', () => {
    const storage = {} as Storage;

    expect(safeLocalStorage(() => storage)).toBe(storage);
  });

  it('returns null when browser storage cannot be accessed', () => {
    expect(
      safeLocalStorage(() => {
        throw new DOMException('storage unavailable', 'SecurityError');
      }),
    ).toBeNull();
  });
});
