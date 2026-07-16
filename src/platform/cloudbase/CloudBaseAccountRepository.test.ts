import { describe, expect, it, vi } from 'vitest';

import {
  AccountRepositoryError,
  CloudBaseAccountRepository,
} from './CloudBaseAccountRepository';

describe('CloudBaseAccountRepository', () => {
  it('calls the auth-bound deletion RPC without passing user identity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });
    const repository = new CloudBaseAccountRepository({ rpc });

    await expect(repository.deleteMyApplicationData()).resolves.toEqual({ deleted: true });

    expect(rpc).toHaveBeenCalledWith('delete_my_application_data');
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/user[_-]?id|user-a|email/i);
  });

  it.each([
    ['provider error', { data: null, error: { message: 'private SQL detail' } }],
    ['invalid response', { data: { deleted: false }, error: null }],
  ])('maps %s to a safe account error', async (_case, response) => {
    const repository = new CloudBaseAccountRepository({
      rpc: vi.fn().mockResolvedValue(response),
    });

    const error = await repository.deleteMyApplicationData().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AccountRepositoryError);
    expect(error).toMatchObject({
      code: 'account/unavailable',
      message: 'Account data operation is unavailable',
    });
    expect(String(error)).not.toContain('private SQL detail');
  });
});
